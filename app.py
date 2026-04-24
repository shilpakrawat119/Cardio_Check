from flask import Flask, request, jsonify, send_from_directory
import joblib
import numpy as np
import pandas as pd
import os
import json
from datetime import datetime, timezone
from pathlib import Path

app = Flask(__name__, static_folder="static", static_url_path="")

DATA_DIR = Path(__file__).resolve().parent / "data"
SCORES_PATH = DATA_DIR / "community_scores.json"
HEART_ACTIONS = {
    "walk_30": {"label": "30 minute brisk walk", "points": 10},
    "veggies": {"label": "Ate 5 servings of fruits or vegetables", "points": 8},
    "no_smoking": {"label": "Stayed smoke-free today", "points": 12},
    "bp_check": {"label": "Checked blood pressure", "points": 6},
    "sleep": {"label": "Slept 7+ hours", "points": 8},
    "water": {"label": "Chose water instead of a sugary drink", "points": 5},
    "meditation": {"label": "Did 10 minutes of stress relief", "points": 7},
    "survey_invite": {"label": "Invited a friend to take the survey", "points": 5},
}


def load_scores():
    if not SCORES_PATH.exists():
        return {"players": {}, "activity": []}

    try:
        with SCORES_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"players": {}, "activity": []}


def save_scores(scores):
    DATA_DIR.mkdir(exist_ok=True)
    with SCORES_PATH.open("w", encoding="utf-8") as f:
        json.dump(scores, f, indent=2)


def public_leaderboard(scores, limit=10):
    players = scores.get("players", {}).values()
    ranked = sorted(players, key=lambda p: (-p.get("points", 0), p.get("name", "").lower()))
    return [
        {
            "rank": index + 1,
            "name": player.get("name", "Friend"),
            "points": player.get("points", 0),
            "actions": player.get("actions", 0),
            "last_action": player.get("last_action", "Joined CardioCheck"),
        }
        for index, player in enumerate(ranked[:limit])
    ]

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


@app.route("/api/heart-actions")
def heart_actions():
    return jsonify([
        {"id": action_id, **action}
        for action_id, action in HEART_ACTIONS.items()
    ])


@app.route("/api/leaderboard")
def leaderboard():
    scores = load_scores()
    return jsonify({
        "leaderboard": public_leaderboard(scores),
        "activity": scores.get("activity", [])[:8],
    })


@app.route("/api/points", methods=["POST"])
def add_points():
    data = request.get_json() or {}
    name = str(data.get("name", "")).strip()
    action_id = str(data.get("action_id", "")).strip()
    note = str(data.get("note", "")).strip()

    if not name:
        return jsonify({"error": "Name is required."}), 400
    if action_id not in HEART_ACTIONS:
        return jsonify({"error": "Choose a valid heart-healthy action."}), 400

    name = name[:40]
    note = note[:140]
    action = HEART_ACTIONS[action_id]
    player_key = name.lower()
    scores = load_scores()
    players = scores.setdefault("players", {})
    player = players.setdefault(player_key, {
        "name": name,
        "points": 0,
        "actions": 0,
        "last_action": "",
    })

    player["name"] = name
    player["points"] = int(player.get("points", 0)) + action["points"]
    player["actions"] = int(player.get("actions", 0)) + 1
    player["last_action"] = action["label"]

    entry = {
        "name": name,
        "action": action["label"],
        "points": action["points"],
        "note": note,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    activity = scores.setdefault("activity", [])
    activity.insert(0, entry)
    scores["activity"] = activity[:50]
    save_scores(scores)

    return jsonify({
        "message": f"+{action['points']} heart points added.",
        "player": player,
        "leaderboard": public_leaderboard(scores),
        "activity": scores["activity"][:8],
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
    app.run(debug=True, host="0.0.0.0", port=port)
