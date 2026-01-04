from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import PyPDF2
import io
import os
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import KNeighborsClassifier
from datetime import datetime

app = Flask(__name__)
# CORS is essential to allow your frontend (port 3000) to talk to this backend
CORS(app)

# --- 1. DATASET SETUP ---
# Update 'cs_students.csv' to your actual filename if different
DATASET_PATH = 'dataset/cs_students.csv'

def train_model():
    if not os.path.exists(DATASET_PATH):
        print(f"Error: {DATASET_PATH} not found!")
        return None, None
    
    # Load your Kaggle dataset
    df = pd.read_csv(DATASET_PATH)
    
    # Combine relevant columns for features (using your Major and Projects columns)
    # This creates a text 'fingerprint' for each career
    df['combined_features'] = df['Major'].fillna('') + " " + df['Projects'].fillna('')
    
    # Convert text to numbers for the ML model
    tfidf = TfidfVectorizer(stop_words='english')
    X = tfidf.fit_transform(df['combined_features'])
    
    # Target column is 'Future Career'
    y = df['Future Career']
    
    # Train a simple classifier
    model = KNeighborsClassifier(n_neighbors=3)
    model.fit(X, y)
    
    print("Model trained successfully on Kaggle dataset!")
    return tfidf, model

# Initialize the model when the server starts
tfidf_vec, ml_model = train_model()

# --- 2. PREDICTION ENDPOINT ---
@app.route('/predict', methods=['POST'])
def predict():
    try:
        if 'resume' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['resume']
        
        # Extract text from the uploaded PDF
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file.read()))
        resume_text = ""
        for page in pdf_reader.pages:
            resume_text += page.extract_text()
            
        if not resume_text.strip():
            return jsonify({"error": "Could not read text from PDF"}), 400

        # Use the trained model to find the best career matches
        if ml_model and tfidf_vec:
            features = tfidf_vec.transform([resume_text])
            # Get the top 3 most similar career matches
            distances, indices = ml_model.kneighbors(features)
            
            # Get the career names from the dataset based on indices
            df = pd.read_csv(DATASET_PATH)
            predictions = df.iloc[indices[0]]['Future Career'].unique().tolist()
        else:
            # Fallback if model isn't trained
            predictions = ["Software Engineer", "Data Scientist"]

        # Return the list of jobs back to app.js to be saved in Firestore
        return jsonify({"jobs": predictions})

    except Exception as e:
        print(f"Server Error: {str(e)}")
        return jsonify({"error": "Internal Server Error"}), 500

@app.route('/feedback', methods=['POST'])
def feedback():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        name = data.get('name', '').strip()
        email = data.get('email', '').strip()
        message = data.get('message', '').strip()

        if not (name and email and message):
            return jsonify({"error": "name, email and message required"}), 400

        feedback_path = 'dataset/feedback.csv'
        row = {
            'name': name,
            'email': email,
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }

        # Append to CSV (create if missing)
        if os.path.exists(feedback_path):
            df = pd.read_csv(feedback_path)
            df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
        else:
            df = pd.DataFrame([row])

        df.to_csv(feedback_path, index=False)
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        print(f"Feedback Error: {str(e)}")
        return jsonify({"error": "Internal Server Error"}), 500


@app.route('/feedbacks', methods=['GET'])
def get_feedbacks():
    try:
        feedback_path = 'dataset/feedback.csv'
        if not os.path.exists(feedback_path):
            return jsonify([]), 200

        df = pd.read_csv(feedback_path)
        # normalize timestamps as string and fillna
        if 'timestamp' not in df.columns:
            df['timestamp'] = ''
        else:
            df['timestamp'] = df['timestamp'].fillna('')

        records = df.to_dict(orient='records')
        return jsonify(records), 200
    except Exception as e:
        print(f"Get Feedbacks Error: {str(e)}")
        return jsonify({"error": "Internal Server Error"}), 500


if __name__ == '__main__':
    # Running on port 5000 as required by your frontend logic
    app.run(port=5000, debug=True)