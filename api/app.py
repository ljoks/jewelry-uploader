from flask import Flask, request, jsonify
from flask_cors import CORS

import base64
import cv2 as cv
import numpy as np
import os
import requests

app = Flask(__name__)
CORS(app)

# ---- Utility function (your marker detection and removal) ----
def process_image_marker(base64_data_url):
    """
    Given a Base64 data URL of an image, detect an ArUco marker (using DICT_4X4_250),
    remove it via inpainting, and return a tuple:
      (marker_id, cleaned_data_url)
    If no marker is detected, marker_id is None.
    """
    # Remove data URL prefix if present.
    if base64_data_url.startswith("data:image"):
        base64_str = base64_data_url.split(",")[1]
    else:
        base64_str = base64_data_url

    # Decode Base64 to bytes, then to NumPy array and image.
    img_data = base64.b64decode(base64_str)
    np_arr = np.frombuffer(img_data, np.uint8)
    image = cv.imdecode(np_arr, cv.IMREAD_COLOR)
    if image is None:
        return None, base64_data_url

    gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)

    # Instantiate the ArucoDetector using the new API (using DICT_4X4_250).
    dictionary = cv.aruco.getPredefinedDictionary(cv.aruco.DICT_4X4_250)
    parameters = cv.aruco.DetectorParameters()
    detector = cv.aruco.ArucoDetector(dictionary, parameters)

    markerCorners, markerIds, rejectedCandidates = detector.detectMarkers(gray)

    marker_id = None
    if markerIds is not None and len(markerIds) > 0:
        marker_id = int(markerIds[0][0])  # Take the first detected marker's ID.

        # Create a mask covering all detected marker regions.
        marker_mask = np.zeros(gray.shape, dtype=np.uint8)
        for corners in markerCorners:
            pts = corners.reshape((4, 2)).astype(np.int32)
            cv.fillConvexPoly(marker_mask, pts, 255)

        # Dilate the mask to ensure full marker coverage.
        kernel = np.ones((5, 5), np.uint8)
        marker_mask = cv.dilate(marker_mask, kernel, iterations=1)
        # Inpaint the marker region.
        image = cv.inpaint(image, marker_mask, inpaintRadius=3, flags=cv.INPAINT_TELEA)

    retval, buffer = cv.imencode('.png', image)
    cleaned_base64 = base64.b64encode(buffer).decode('utf-8')
    cleaned_data_url = "data:image/png;base64," + cleaned_base64

    return marker_id, cleaned_data_url

# ---- Flask route ----
@app.route('/api/generateGroupingAndDescriptions', methods=['POST'])
def generate_groupings_and_descriptions():
    data = request.json
    images = data.get("images", [])
    model = data.get("model", "gpt-4o-mini")
    max_tokens = data.get("max_tokens", 300)

    processed_images = []
    for img_data_url in images:
        marker_id, cleaned_data_url = process_image_marker(img_data_url)
        processed_images.append({
            "marker_id": marker_id,
            "cleaned_image": cleaned_data_url
        })

    # Group by marker_id
    groups = {}
    for idx, img in enumerate(processed_images):
        key = str(img["marker_id"]) if img["marker_id"] is not None else "unknown"
        if key not in groups:
            groups[key] = []
        groups[key].append({
            "index": idx,
            "marker_id": img["marker_id"],
            "image": img["cleaned_image"]
        })

    print(groups)
    return {"success": "200"}  

    '''
    # Call GPT-4o for each group
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        return jsonify({"error": "Missing OPENAI_API_KEY"}), 500

    group_results = []
    for marker_id, images_group in groups.items():
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "You are an expert jewelry marketer. Based on the following images (each cleaned to remove markers), generate a detailed, marketing-friendly description for this jewelry item."
                    }
                ] + [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": img["image"],
                            "detail": "high"
                        }
                    } for img in images_group
                ]
            }
        ]

        openai_payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens
        }

        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            },
            json=openai_payload
        )

        if response.status_code != 200:
            return jsonify({"error": response.text}), response.status_code

        description = response.json()["choices"][0]["message"]["content"]
        group_results.append({
            "marker_id": marker_id,
            "description": description,
            "imageIndices": [img["index"] for img in images_group]
        })

    return jsonify(group_results)
'''
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
