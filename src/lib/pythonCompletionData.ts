// Python completion data for Monaco editor
// Used by monacoCompletions.ts to provide context-aware autocomplete

export type CompletionKind = "Method" | "Property" | "Function" | "Class" | "Module";

export interface CompletionItem {
  label: string;
  insertText: string;
  documentation: string;
  kind: CompletionKind;
}

export const pandasMethods: CompletionItem[] = [
  // Data inspection
  { label: "head", insertText: "head(${1:5})", documentation: "Return first n rows", kind: "Method" },
  { label: "tail", insertText: "tail(${1:5})", documentation: "Return last n rows", kind: "Method" },
  { label: "describe", insertText: "describe()", documentation: "Generate descriptive statistics", kind: "Method" },
  { label: "info", insertText: "info()", documentation: "Print DataFrame info", kind: "Method" },
  { label: "sample", insertText: "sample(${1:n})", documentation: "Return random sample of items", kind: "Method" },

  // Properties
  { label: "shape", insertText: "shape", documentation: "Return (rows, columns) tuple", kind: "Property" },
  { label: "columns", insertText: "columns", documentation: "Return column labels", kind: "Property" },
  { label: "dtypes", insertText: "dtypes", documentation: "Return column data types", kind: "Property" },
  { label: "index", insertText: "index", documentation: "Return index (row labels)", kind: "Property" },
  { label: "values", insertText: "values", documentation: "Return numpy array of values", kind: "Property" },
  { label: "T", insertText: "T", documentation: "Return transposed DataFrame", kind: "Property" },

  // Indexing
  { label: "loc", insertText: "loc[${1:row}, ${2:col}]", documentation: "Label-based indexing", kind: "Property" },
  { label: "iloc", insertText: "iloc[${1:row}, ${2:col}]", documentation: "Integer-based indexing", kind: "Property" },
  { label: "at", insertText: "at[${1:row}, ${2:col}]", documentation: "Access single value by label", kind: "Property" },
  { label: "iat", insertText: "iat[${1:row}, ${2:col}]", documentation: "Access single value by position", kind: "Property" },

  // Missing data
  { label: "dropna", insertText: "dropna()", documentation: "Remove missing values", kind: "Method" },
  { label: "fillna", insertText: "fillna(${1:value})", documentation: "Fill NA/NaN values", kind: "Method" },
  { label: "isna", insertText: "isna()", documentation: "Detect missing values", kind: "Method" },
  { label: "notna", insertText: "notna()", documentation: "Detect non-missing values", kind: "Method" },
  { label: "interpolate", insertText: "interpolate()", documentation: "Fill NaN by interpolation", kind: "Method" },

  // Transformation
  { label: "groupby", insertText: "groupby('${1:column}')", documentation: "Group by column(s)", kind: "Method" },
  { label: "merge", insertText: "merge(${1:right}, on='${2:key}')", documentation: "Merge DataFrames", kind: "Method" },
  { label: "join", insertText: "join(${1:other})", documentation: "Join columns with other DataFrame", kind: "Method" },
  { label: "concat", insertText: "concat([${1:df1}, ${2:df2}])", documentation: "Concatenate DataFrames", kind: "Function" },
  { label: "pivot", insertText: "pivot(index='${1:idx}', columns='${2:col}', values='${3:val}')", documentation: "Reshape data by column values", kind: "Method" },
  { label: "pivot_table", insertText: "pivot_table(values='${1:val}', index='${2:idx}', columns='${3:col}')", documentation: "Create spreadsheet-style pivot table", kind: "Method" },
  { label: "melt", insertText: "melt(id_vars='${1:id}')", documentation: "Unpivot DataFrame from wide to long", kind: "Method" },

  // Sorting
  { label: "sort_values", insertText: "sort_values('${1:column}')", documentation: "Sort by column values", kind: "Method" },
  { label: "sort_index", insertText: "sort_index()", documentation: "Sort by index", kind: "Method" },
  { label: "nlargest", insertText: "nlargest(${1:n}, '${2:column}')", documentation: "Return n largest values", kind: "Method" },
  { label: "nsmallest", insertText: "nsmallest(${1:n}, '${2:column}')", documentation: "Return n smallest values", kind: "Method" },

  // Aggregation
  { label: "value_counts", insertText: "value_counts()", documentation: "Count unique values", kind: "Method" },
  { label: "nunique", insertText: "nunique()", documentation: "Count distinct values", kind: "Method" },
  { label: "count", insertText: "count()", documentation: "Count non-NA cells", kind: "Method" },
  { label: "sum", insertText: "sum()", documentation: "Sum of values", kind: "Method" },
  { label: "mean", insertText: "mean()", documentation: "Mean of values", kind: "Method" },
  { label: "median", insertText: "median()", documentation: "Median of values", kind: "Method" },
  { label: "std", insertText: "std()", documentation: "Standard deviation", kind: "Method" },
  { label: "var", insertText: "var()", documentation: "Variance", kind: "Method" },
  { label: "min", insertText: "min()", documentation: "Minimum value", kind: "Method" },
  { label: "max", insertText: "max()", documentation: "Maximum value", kind: "Method" },
  { label: "agg", insertText: "agg(${1:func})", documentation: "Aggregate using one or more operations", kind: "Method" },

  // Apply functions
  { label: "apply", insertText: "apply(${1:func})", documentation: "Apply function along axis", kind: "Method" },
  { label: "map", insertText: "map(${1:func})", documentation: "Map values using function", kind: "Method" },
  { label: "transform", insertText: "transform(${1:func})", documentation: "Transform values in groups", kind: "Method" },

  // Selection
  { label: "query", insertText: "query('${1:condition}')", documentation: "Query DataFrame with boolean expression", kind: "Method" },
  { label: "filter", insertText: "filter(items=${1:list})", documentation: "Subset rows or columns by labels", kind: "Method" },
  { label: "select_dtypes", insertText: "select_dtypes(include=['${1:type}'])", documentation: "Select columns by dtype", kind: "Method" },
  { label: "drop", insertText: "drop(${1:labels})", documentation: "Drop rows or columns", kind: "Method" },
  { label: "drop_duplicates", insertText: "drop_duplicates()", documentation: "Remove duplicate rows", kind: "Method" },

  // Rename/Replace
  { label: "rename", insertText: "rename(columns={${1:old}: ${2:new}})", documentation: "Rename columns or index", kind: "Method" },
  { label: "replace", insertText: "replace(${1:old}, ${2:new})", documentation: "Replace values", kind: "Method" },
  { label: "astype", insertText: "astype('${1:dtype}')", documentation: "Cast to a dtype", kind: "Method" },

  // I/O
  { label: "to_csv", insertText: "to_csv('${1:path}')", documentation: "Write to CSV file", kind: "Method" },
  { label: "to_json", insertText: "to_json('${1:path}')", documentation: "Write to JSON file", kind: "Method" },
  { label: "to_parquet", insertText: "to_parquet('${1:path}')", documentation: "Write to Parquet file", kind: "Method" },
  { label: "to_numpy", insertText: "to_numpy()", documentation: "Convert to numpy array", kind: "Method" },
  { label: "to_dict", insertText: "to_dict()", documentation: "Convert to dictionary", kind: "Method" },

  // Copy
  { label: "copy", insertText: "copy()", documentation: "Make a copy of the object", kind: "Method" },
];

export const numpyFunctions: CompletionItem[] = [
  // Array creation
  { label: "array", insertText: "array(${1:object})", documentation: "Create array from list/tuple", kind: "Function" },
  { label: "zeros", insertText: "zeros(${1:shape})", documentation: "Array of zeros", kind: "Function" },
  { label: "ones", insertText: "ones(${1:shape})", documentation: "Array of ones", kind: "Function" },
  { label: "empty", insertText: "empty(${1:shape})", documentation: "Uninitialized array", kind: "Function" },
  { label: "full", insertText: "full(${1:shape}, ${2:fill_value})", documentation: "Array filled with value", kind: "Function" },
  { label: "arange", insertText: "arange(${1:start}, ${2:stop}, ${3:step})", documentation: "Evenly spaced values", kind: "Function" },
  { label: "linspace", insertText: "linspace(${1:start}, ${2:stop}, ${3:num})", documentation: "Evenly spaced numbers", kind: "Function" },
  { label: "eye", insertText: "eye(${1:N})", documentation: "Identity matrix", kind: "Function" },
  { label: "identity", insertText: "identity(${1:n})", documentation: "Square identity matrix", kind: "Function" },

  // Random
  { label: "random.rand", insertText: "random.rand(${1:d0}, ${2:d1})", documentation: "Random values [0, 1)", kind: "Function" },
  { label: "random.randn", insertText: "random.randn(${1:d0}, ${2:d1})", documentation: "Standard normal random", kind: "Function" },
  { label: "random.randint", insertText: "random.randint(${1:low}, ${2:high}, ${3:size})", documentation: "Random integers", kind: "Function" },
  { label: "random.choice", insertText: "random.choice(${1:a}, ${2:size})", documentation: "Random sample from array", kind: "Function" },
  { label: "random.shuffle", insertText: "random.shuffle(${1:x})", documentation: "Shuffle array in-place", kind: "Function" },

  // Math operations
  { label: "sum", insertText: "sum(${1:a})", documentation: "Sum of array elements", kind: "Function" },
  { label: "mean", insertText: "mean(${1:a})", documentation: "Arithmetic mean", kind: "Function" },
  { label: "std", insertText: "std(${1:a})", documentation: "Standard deviation", kind: "Function" },
  { label: "var", insertText: "var(${1:a})", documentation: "Variance", kind: "Function" },
  { label: "min", insertText: "min(${1:a})", documentation: "Minimum value", kind: "Function" },
  { label: "max", insertText: "max(${1:a})", documentation: "Maximum value", kind: "Function" },
  { label: "argmin", insertText: "argmin(${1:a})", documentation: "Index of minimum", kind: "Function" },
  { label: "argmax", insertText: "argmax(${1:a})", documentation: "Index of maximum", kind: "Function" },
  { label: "abs", insertText: "abs(${1:x})", documentation: "Absolute value", kind: "Function" },
  { label: "sqrt", insertText: "sqrt(${1:x})", documentation: "Square root", kind: "Function" },
  { label: "exp", insertText: "exp(${1:x})", documentation: "Exponential", kind: "Function" },
  { label: "log", insertText: "log(${1:x})", documentation: "Natural logarithm", kind: "Function" },
  { label: "log10", insertText: "log10(${1:x})", documentation: "Base-10 logarithm", kind: "Function" },
  { label: "power", insertText: "power(${1:x}, ${2:y})", documentation: "x raised to power y", kind: "Function" },

  // Linear algebra
  { label: "dot", insertText: "dot(${1:a}, ${2:b})", documentation: "Dot product", kind: "Function" },
  { label: "matmul", insertText: "matmul(${1:a}, ${2:b})", documentation: "Matrix multiplication", kind: "Function" },
  { label: "transpose", insertText: "transpose(${1:a})", documentation: "Transpose array", kind: "Function" },
  { label: "linalg.inv", insertText: "linalg.inv(${1:a})", documentation: "Matrix inverse", kind: "Function" },
  { label: "linalg.det", insertText: "linalg.det(${1:a})", documentation: "Matrix determinant", kind: "Function" },
  { label: "linalg.eig", insertText: "linalg.eig(${1:a})", documentation: "Eigenvalues and vectors", kind: "Function" },
  { label: "linalg.norm", insertText: "linalg.norm(${1:x})", documentation: "Matrix/vector norm", kind: "Function" },

  // Shape manipulation
  { label: "reshape", insertText: "reshape(${1:a}, ${2:shape})", documentation: "Reshape array", kind: "Function" },
  { label: "flatten", insertText: "flatten()", documentation: "Flatten to 1D", kind: "Method" },
  { label: "ravel", insertText: "ravel(${1:a})", documentation: "Flatten array", kind: "Function" },
  { label: "squeeze", insertText: "squeeze(${1:a})", documentation: "Remove single-dim entries", kind: "Function" },
  { label: "expand_dims", insertText: "expand_dims(${1:a}, ${2:axis})", documentation: "Expand array shape", kind: "Function" },
  { label: "concatenate", insertText: "concatenate([${1:a1}, ${2:a2}])", documentation: "Join arrays", kind: "Function" },
  { label: "stack", insertText: "stack([${1:a1}, ${2:a2}])", documentation: "Stack arrays", kind: "Function" },
  { label: "split", insertText: "split(${1:a}, ${2:indices})", documentation: "Split array", kind: "Function" },

  // Searching/Sorting
  { label: "where", insertText: "where(${1:condition})", documentation: "Return elements by condition", kind: "Function" },
  { label: "sort", insertText: "sort(${1:a})", documentation: "Sort array", kind: "Function" },
  { label: "argsort", insertText: "argsort(${1:a})", documentation: "Indices that would sort", kind: "Function" },
  { label: "unique", insertText: "unique(${1:a})", documentation: "Unique elements", kind: "Function" },

  // Boolean
  { label: "all", insertText: "all(${1:a})", documentation: "Test if all true", kind: "Function" },
  { label: "any", insertText: "any(${1:a})", documentation: "Test if any true", kind: "Function" },
  { label: "isnan", insertText: "isnan(${1:x})", documentation: "Test for NaN", kind: "Function" },
  { label: "isinf", insertText: "isinf(${1:x})", documentation: "Test for infinity", kind: "Function" },
];

export const sklearnImports: CompletionItem[] = [
  // Model selection
  { label: "train_test_split", insertText: "from sklearn.model_selection import train_test_split", documentation: "Split arrays into train and test subsets", kind: "Module" },
  { label: "cross_val_score", insertText: "from sklearn.model_selection import cross_val_score", documentation: "Evaluate with cross-validation", kind: "Module" },
  { label: "GridSearchCV", insertText: "from sklearn.model_selection import GridSearchCV", documentation: "Exhaustive search over parameters", kind: "Class" },
  { label: "RandomizedSearchCV", insertText: "from sklearn.model_selection import RandomizedSearchCV", documentation: "Randomized parameter search", kind: "Class" },
  { label: "KFold", insertText: "from sklearn.model_selection import KFold", documentation: "K-Folds cross-validator", kind: "Class" },
  { label: "StratifiedKFold", insertText: "from sklearn.model_selection import StratifiedKFold", documentation: "Stratified K-Folds", kind: "Class" },

  // Preprocessing
  { label: "StandardScaler", insertText: "from sklearn.preprocessing import StandardScaler", documentation: "Standardize features (zero mean, unit variance)", kind: "Class" },
  { label: "MinMaxScaler", insertText: "from sklearn.preprocessing import MinMaxScaler", documentation: "Scale features to range [0, 1]", kind: "Class" },
  { label: "LabelEncoder", insertText: "from sklearn.preprocessing import LabelEncoder", documentation: "Encode target labels as integers", kind: "Class" },
  { label: "OneHotEncoder", insertText: "from sklearn.preprocessing import OneHotEncoder", documentation: "Encode categorical features", kind: "Class" },
  { label: "PolynomialFeatures", insertText: "from sklearn.preprocessing import PolynomialFeatures", documentation: "Generate polynomial features", kind: "Class" },

  // Linear models
  { label: "LinearRegression", insertText: "from sklearn.linear_model import LinearRegression", documentation: "Ordinary least squares regression", kind: "Class" },
  { label: "LogisticRegression", insertText: "from sklearn.linear_model import LogisticRegression", documentation: "Logistic regression classifier", kind: "Class" },
  { label: "Ridge", insertText: "from sklearn.linear_model import Ridge", documentation: "Linear regression with L2 regularization", kind: "Class" },
  { label: "Lasso", insertText: "from sklearn.linear_model import Lasso", documentation: "Linear regression with L1 regularization", kind: "Class" },
  { label: "ElasticNet", insertText: "from sklearn.linear_model import ElasticNet", documentation: "Linear regression with L1+L2 regularization", kind: "Class" },

  // Tree models
  { label: "DecisionTreeClassifier", insertText: "from sklearn.tree import DecisionTreeClassifier", documentation: "Decision tree classifier", kind: "Class" },
  { label: "DecisionTreeRegressor", insertText: "from sklearn.tree import DecisionTreeRegressor", documentation: "Decision tree regressor", kind: "Class" },
  { label: "RandomForestClassifier", insertText: "from sklearn.ensemble import RandomForestClassifier", documentation: "Random forest classifier", kind: "Class" },
  { label: "RandomForestRegressor", insertText: "from sklearn.ensemble import RandomForestRegressor", documentation: "Random forest regressor", kind: "Class" },
  { label: "GradientBoostingClassifier", insertText: "from sklearn.ensemble import GradientBoostingClassifier", documentation: "Gradient boosting classifier", kind: "Class" },
  { label: "GradientBoostingRegressor", insertText: "from sklearn.ensemble import GradientBoostingRegressor", documentation: "Gradient boosting regressor", kind: "Class" },

  // SVM
  { label: "SVC", insertText: "from sklearn.svm import SVC", documentation: "Support vector classifier", kind: "Class" },
  { label: "SVR", insertText: "from sklearn.svm import SVR", documentation: "Support vector regressor", kind: "Class" },

  // Neighbors
  { label: "KNeighborsClassifier", insertText: "from sklearn.neighbors import KNeighborsClassifier", documentation: "K-nearest neighbors classifier", kind: "Class" },
  { label: "KNeighborsRegressor", insertText: "from sklearn.neighbors import KNeighborsRegressor", documentation: "K-nearest neighbors regressor", kind: "Class" },

  // Clustering
  { label: "KMeans", insertText: "from sklearn.cluster import KMeans", documentation: "K-Means clustering", kind: "Class" },
  { label: "DBSCAN", insertText: "from sklearn.cluster import DBSCAN", documentation: "Density-based clustering", kind: "Class" },

  // Metrics
  { label: "accuracy_score", insertText: "from sklearn.metrics import accuracy_score", documentation: "Accuracy classification score", kind: "Module" },
  { label: "precision_score", insertText: "from sklearn.metrics import precision_score", documentation: "Precision score", kind: "Module" },
  { label: "recall_score", insertText: "from sklearn.metrics import recall_score", documentation: "Recall score", kind: "Module" },
  { label: "f1_score", insertText: "from sklearn.metrics import f1_score", documentation: "F1 score", kind: "Module" },
  { label: "confusion_matrix", insertText: "from sklearn.metrics import confusion_matrix", documentation: "Confusion matrix", kind: "Module" },
  { label: "classification_report", insertText: "from sklearn.metrics import classification_report", documentation: "Text report of metrics", kind: "Module" },
  { label: "mean_squared_error", insertText: "from sklearn.metrics import mean_squared_error", documentation: "Mean squared error", kind: "Module" },
  { label: "mean_absolute_error", insertText: "from sklearn.metrics import mean_absolute_error", documentation: "Mean absolute error", kind: "Module" },
  { label: "r2_score", insertText: "from sklearn.metrics import r2_score", documentation: "R-squared score", kind: "Module" },

  // Pipeline
  { label: "Pipeline", insertText: "from sklearn.pipeline import Pipeline", documentation: "Chain transforms and estimator", kind: "Class" },
  { label: "make_pipeline", insertText: "from sklearn.pipeline import make_pipeline", documentation: "Construct a Pipeline", kind: "Module" },

  // Imputation
  { label: "SimpleImputer", insertText: "from sklearn.impute import SimpleImputer", documentation: "Impute missing values", kind: "Class" },

  // Feature selection
  { label: "SelectKBest", insertText: "from sklearn.feature_selection import SelectKBest", documentation: "Select K best features", kind: "Class" },
  { label: "RFE", insertText: "from sklearn.feature_selection import RFE", documentation: "Recursive feature elimination", kind: "Class" },
];
