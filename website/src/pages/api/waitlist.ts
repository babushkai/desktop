import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { email, platform, useCase } = data;

    // Validate email
    if (!email || !isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: 'Please provide a valid email address.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate platform
    if (!platform || !['windows', 'linux', 'both'].includes(platform)) {
      return new Response(
        JSON.stringify({ error: 'Please select a platform.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Here you would integrate with your email service
    // Options:
    // 1. Buttondown: https://api.buttondown.email/v1/subscribers
    // 2. Resend: https://resend.com/docs/api-reference/contacts
    // 3. ConvertKit, Mailchimp, etc.

    // Example with Buttondown (uncomment and add your API key):
    /*
    const buttondownResponse = await fetch('https://api.buttondown.email/v1/subscribers', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${import.meta.env.BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        metadata: { platform, useCase },
        tags: ['waitlist', platform],
      }),
    });

    if (!buttondownResponse.ok) {
      const error = await buttondownResponse.json();
      if (error.code === 'email_already_exists') {
        return new Response(
          JSON.stringify({ error: 'This email is already on the waitlist.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Failed to add to waitlist');
    }
    */

    // For now, just log and return success (implement actual storage later)
    console.log('Waitlist signup:', { email, platform, useCase, timestamp: new Date().toISOString() });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Thanks for joining the waitlist! We\'ll notify you when your platform is ready.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Waitlist error:', error);
    return new Response(
      JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Handle OPTIONS for CORS preflight
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
