from flask import Flask, request, jsonify, send_from_directory
import joblib
import numpy as np
import pandas as pd
import os

app = Flask(__name__, static_folder="static", static_url_path="")

# ─────────────────────────────────────────────
# LOAD BUNDLE (model + features + threshold)
# ─────────────────────────────────────────────
BUNDLE_PATH = os.path.join(os.path.dirname(__file__), "cardio_bundle_v7.pkl")
bundle    = None
model     = None
FEATURES  = None
THRESHOLD = None

def load_model():
    global bundle, model, FEATURES, THRESHOLD
    try:
        bundle    = joblib.load(BUNDLE_PATH)

        print("Bundle type:", type(bundle))
        print("Bundle keys:", bundle.keys())
        print("Model type:", type(bundle["model"]))
        model     = bundle["model"]
        FEATURES  = bundle["features"]
        THRESHOLD = bundle["threshold"]
        print(f"✅ Bundle loaded | threshold={THRESHOLD:.3f} | features={FEATURES}")
    except Exception as e:
        print(f"❌ Bundle load error: {e}")

load_model()

# ─────────────────────────────────────────────
# FEATURE ORDER (must exactly match train_model.py FEATURES list)
# ─────────────────────────────────────────────
# ["age_years", "gender", "height", "weight",
#  "ap_hi", "ap_lo", "cholesterol", "gluc",
#  "smoke", "alco", "active",
#  "bmi", "pulse_pressure", "map",
#  "age_bp", "bmi_age"]

# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("static", path)

@app.route("/health")
def health():
    return jsonify({
        "status":    "ok",
        "model":     "XGBoost cardio_bundle_v7",
        "threshold": round(THRESHOLD, 3) if THRESHOLD else None,
        "features":  FEATURES
    })

@app.route("/predict", methods=["POST"])
def predict():
    if model is None:
        return jsonify({"error": "Model not loaded. Check cardio_bundle_v7.pkl path."}), 500

    try:
        data = request.get_json()

        # ── Raw inputs (with safe defaults) ──────────────────
        age_years  = float(data.get("age",    data.get("age_years", 53.0)))
        gender     = int(data.get("gender",   1))       # 1=Female, 2=Male
        height     = float(data.get("height", 165.0))   # cm
        weight     = float(data.get("weight", 72.0))    # kg
        ap_hi      = float(data.get("ap_hi",  120.0))   # systolic mmHg
        ap_lo      = float(data.get("ap_lo",  80.0))    # diastolic mmHg
        cholesterol = int(data.get("cholesterol", 1))   # 1/2/3
        gluc       = int(data.get("gluc",     1))       # 1/2/3
        smoke      = int(data.get("smoke",    0))       # 0/1
        alco       = int(data.get("alco",     0))       # 0/1
        active     = int(data.get("active",   1))       # 0/1

        # ── Feature engineering (mirrors train_model.py exactly) ──
        bmi            = weight / (height / 100) ** 2
        pulse_pressure = ap_hi - ap_lo
        map_val        = ap_lo + pulse_pressure / 3
        age_bp         = age_years * ap_hi
        bmi_age        = bmi * age_years

        # ── Build DataFrame with correct feature names & order ──
        features = pd.DataFrame([{
            "age_years":      age_years,
            "gender":         gender,
            "height":         height,
            "weight":         weight,
            "ap_hi":          ap_hi,
            "ap_lo":          ap_lo,
            "cholesterol":    cholesterol,
            "gluc":           gluc,
            "smoke":          smoke,
            "alco":           alco,
            "active":         active,
            "bmi":            bmi,
            "pulse_pressure": pulse_pressure,
            "map":            map_val,
            "age_bp":         age_bp,
            "bmi_age":        bmi_age,
        }])[FEATURES]  # enforce exact column order from bundle

        # ── Predict using bundle threshold ──────────────────
        proba      = float(model.predict_proba(features)[0][1])
        prediction = int(proba >= THRESHOLD)

        # ── Risk label ───────────────────────────────────────
        if proba < 0.35:
            risk_level = "Low Risk"
        elif proba < 0.55:
            risk_level = "Moderate Risk"
        elif proba < 0.70:
            risk_level = "Elevated Risk"
        else:
            risk_level = "High Risk"

        return jsonify({
            "prediction":     prediction,
            "probability":    round(proba * 100, 1),
            "bmi":            round(bmi, 1),
            "risk_level":     risk_level,
            "threshold_used": round(THRESHOLD, 3),
            "disclaimer":     "This tool errs on the side of caution — a risk flag means 'talk to a doctor', not 'you have heart disease'."
        })

    except KeyError as e:
        return jsonify({"error": f"Missing field: {e}"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'
