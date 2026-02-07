use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

// Track active requests for cancellation
static ACTIVE_REQUESTS: std::sync::OnceLock<Mutex<HashSet<String>>> = std::sync::OnceLock::new();

fn get_active_requests() -> &'static Mutex<HashSet<String>> {
    ACTIVE_REQUESTS.get_or_init(|| Mutex::new(HashSet::new()))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub modified_at: Option<String>,
    pub size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct OllamaModelsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<OllamaOptions>,
}

#[derive(Debug, Serialize)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct OllamaGenerateResponse {
    response: String,
    #[allow(dead_code)]
    done: bool,
}

/// Check if Ollama is running and accessible
pub async fn check_status(host: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    match client.get(host).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// List available models from Ollama
pub async fn list_models(host: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let url = format!("{}/api/tags", host);
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama returned error: {}", resp.status()));
    }

    let models: OllamaModelsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(models.models.into_iter().map(|m| m.name).collect())
}


/// Build a prompt for the given model
fn build_prompt(model: &str, context: &str, cursor_line: &str, columns: &[String]) -> String {
    let model_lower = model.to_lowercase();

    let columns_comment = if columns.is_empty() {
        String::new()
    } else {
        format!("# columns: {}\n", columns.join(", "))
    };

    let prefix = format!("{}{}{}", columns_comment, context, cursor_line);

    // Use Fill-in-Middle (FIM) format for code models
    if model_lower.contains("deepseek") {
        // DeepSeek Coder FIM format
        format!("<｜fim▁begin｜>{}<｜fim▁hole｜><｜fim▁end｜>", prefix)
    } else if model_lower.contains("qwen") && model_lower.contains("coder") {
        // Qwen Coder FIM format
        format!("<|fim_prefix|>{}<|fim_suffix|><|fim_middle|>", prefix)
    } else if model_lower.contains("starcoder") || model_lower.contains("codellama") {
        // StarCoder/CodeLlama FIM format
        format!("<fim_prefix>{}<fim_suffix><fim_middle>", prefix)
    } else {
        // Generic instruction format for chat models
        format!(
            "Complete this Python code. Reply with ONLY the completion, no explanation.\n\n{}\n\nCompletion:",
            prefix
        )
    }
}

/// Clean up model response by removing FIM markers, markdown, and explanatory text
fn clean_response(raw: &str, model: &str) -> String {
    let mut result = raw.to_string();
    let model_lower = model.to_lowercase();

    // Strip FIM markers based on model
    if model_lower.contains("deepseek") {
        result = result.replace("<｜fim▁end｜>", "");
        result = result.replace("<｜fim▁begin｜>", "");
        result = result.replace("<｜fim▁hole｜>", "");
    } else if model_lower.contains("starcoder") {
        result = result.replace("<fim_middle>", "");
        result = result.replace("<fim_suffix>", "");
        result = result.replace("<fim_prefix>", "");
    } else if model_lower.contains("qwen") {
        result = result.replace("<|fim_middle|>", "");
        result = result.replace("<|fim_suffix|>", "");
        result = result.replace("<|fim_prefix|>", "");
        result = result.replace("<|endoftext|>", "");
    }

    // Try to extract code from markdown code blocks first
    if result.contains("```python") {
        // Extract content between ```python and ```
        if let Some(start) = result.find("```python") {
            let after_marker = &result[start + 9..]; // Skip "```python"
            if let Some(end) = after_marker.find("```") {
                result = after_marker[..end].trim().to_string();
            }
        }
    } else if result.contains("```") {
        // Extract content between ``` and ```
        if let Some(start) = result.find("```") {
            let after_marker = &result[start + 3..]; // Skip "```"
            if let Some(end) = after_marker.find("```") {
                result = after_marker[..end].trim().to_string();
            }
        }
    }

    // Remove any remaining markdown markers
    result = result.replace("```python", "");
    result = result.replace("```", "");

    // Remove explanatory lines (only at the start)
    let lines: Vec<&str> = result.lines().collect();
    let mut start_idx = 0;
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("Here")
            || trimmed.starts_with("I ")
            || trimmed.starts_with("This ")
            || trimmed.starts_with("The ")
            || trimmed.starts_with("Note:")
            || trimmed.starts_with("Explanation:")
            || trimmed.starts_with("Code completion:")
        {
            start_idx = i + 1;
        } else {
            break;
        }
    }

    if start_idx < lines.len() {
        result = lines[start_idx..].join("\n");
    }

    result.trim().to_string()
}

/// Register a request as active (for cancellation tracking)
pub fn register_request(request_id: &str) {
    if let Ok(mut requests) = get_active_requests().lock() {
        requests.insert(request_id.to_string());
    }
}

/// Unregister a request (when complete or cancelled)
pub fn unregister_request(request_id: &str) {
    if let Ok(mut requests) = get_active_requests().lock() {
        requests.remove(request_id);
    }
}

/// Check if a request is still active (not cancelled)
pub fn is_request_active(request_id: &str) -> bool {
    if let Ok(requests) = get_active_requests().lock() {
        requests.contains(request_id)
    } else {
        false
    }
}

/// Cancel a request by removing it from active set
pub fn cancel_request(request_id: &str) {
    unregister_request(request_id);
}

/// Generate a completion using Ollama
pub async fn generate_completion(
    host: &str,
    model: &str,
    context: &str,
    cursor_line: &str,
    columns: &[String],
    request_id: &str,
) -> Result<String, String> {
    // Check if already cancelled
    if !is_request_active(request_id) {
        return Err("cancelled".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let prompt = build_prompt(model, context, cursor_line, columns);

    // Log the prompt for debugging
    tracing::info!("Ollama model={}, prompt ({} chars): {:?}", model, prompt.len(), prompt.chars().take(200).collect::<String>());

    // Don't send options - some remote models don't support them
    let request = OllamaGenerateRequest {
        model: model.to_string(),
        prompt,
        stream: false,
        options: None,
    };

    let url = format!("{}/api/generate", host);
    let resp = client
        .post(&url)
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Request timed out".to_string()
            } else {
                format!("Failed to connect to Ollama: {}", e)
            }
        })?;

    // Check for cancellation again after network call
    if !is_request_active(request_id) {
        return Err("cancelled".to_string());
    }

    if !resp.status().is_success() {
        return Err(format!("Ollama returned error: {}", resp.status()));
    }

    let response: OllamaGenerateResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Log raw response for debugging
    tracing::info!("Ollama raw response ({} chars): {:?}", response.response.len(), response.response.chars().take(200).collect::<String>());

    let cleaned = clean_response(&response.response, model);

    tracing::info!("Ollama cleaned response ({} chars): {:?}", cleaned.len(), cleaned.chars().take(200).collect::<String>());

    // Don't return empty completions - but show what we got
    if cleaned.is_empty() {
        if response.response.is_empty() {
            return Err("Model returned empty response".to_string());
        }
        return Err(format!("Response cleaned to empty. Raw: {}",
            response.response.chars().take(100).collect::<String>()));
    }

    Ok(cleaned)
}