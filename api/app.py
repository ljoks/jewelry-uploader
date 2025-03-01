from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import cv2 as cv
import numpy as np
import os
import requests

app = Flask(__name__)
CORS(app)

def process_image_marker(base64_data_url):
    """
    Given a Base64 data URL of an image, detect an ArUco marker (using DICT_4X4_250)
    and crop the marker out of the image (assumes marker is in the bottom-right).
    Returns a tuple: (marker_id, cropped_data_url).
    If no marker is detected, marker_id will be None and the original image is returned.
    """
    # Remove data URL prefix if present.
    if base64_data_url.startswith("data:image"):
        base64_str = base64_data_url.split(",")[1]
    else:
        base64_str = base64_data_url

    # Decode Base64 into bytes, then into an OpenCV image.
    img_data = base64.b64decode(base64_str)
    np_arr = np.frombuffer(img_data, np.uint8)
    image = cv.imdecode(np_arr, cv.IMREAD_COLOR)
    if image is None:
        return None, base64_data_url

    gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)

    # Instantiate ArucoDetector using new API in OpenCV 4.7.x
    dictionary = cv.aruco.getPredefinedDictionary(cv.aruco.DICT_4X4_250)
    parameters = cv.aruco.DetectorParameters()
    detector = cv.aruco.ArucoDetector(dictionary, parameters)
    markerCorners, markerIds, _ = detector.detectMarkers(gray)

    marker_id = None
    if markerIds is not None and len(markerIds) > 0:
        marker_id = int(markerIds[0][0])  # use first detected marker
        # Get bounding box of the marker.
        corners = markerCorners[0]  # first marker
        pts = corners.reshape((4, 2)).astype(np.int32)
        x, y, w, h = cv.boundingRect(pts)
        img_height, img_width = image.shape[:2]
        # Assume marker is in the bottom-right: crop out marker by cropping
        # to the area above and to the left of the marker.
        if x > img_width * 0.5 and y > img_height * 0.5:
            cropped_image = image[0:y, 0:x]
        else:
            cropped_image = image
    else:
        cropped_image = image

    retval, buffer = cv.imencode('.jpg', cropped_image)
    if not retval:
        return marker_id, base64_data_url
    cleaned_base64 = base64.b64encode(buffer).decode('utf-8')
    cropped_data_url = "data:image/jpeg;base64," + cleaned_base64

    return marker_id, cropped_data_url

@app.route('/api/groupImages', methods=['POST'])
def group_images():
    """
    Expects a JSON payload:
      {
         "images": [ "data:image/jpeg;base64,...", "data:image/jpeg;base64,...", ... ]
      }
    Processes each image (detect marker, crop out marker), then groups images by marker_id.
    Returns an array of groups:
      [
         { "marker_id": "<id or 'unknown'>", "images": [ { "index": 0, "image": "<cleaned data URL>" }, ... ] },
         ...
      ]
    """
    data = request.json
    images = data.get("images", [])
    processed_images = []
    for img_data_url in images:
        marker_id, cleaned_image = process_image_marker(img_data_url)
        processed_images.append({
            "marker_id": marker_id,
            "cleaned_image": cleaned_image
        })

    # Group images by marker_id (use "unknown" if marker_id is None).
    groups = {}
    for idx, img in enumerate(processed_images):
        key = str(img["marker_id"]) if img["marker_id"] is not None else "unknown"
        groups.setdefault(key, []).append({
            "index": idx,
            "image": img["cleaned_image"]
        })
    
    # Format result as a list of groups.
    result = []
    for key, imgs in groups.items():
        result.append({
            "marker_id": key,
            "images": imgs  # each with index and cleaned image
        })
    return jsonify(result)

@app.route('/api/generateDescriptions', methods=['POST'])
def generate_descriptions():
    """
    Expects a JSON payload:
      {
         "groupings": [ { "marker_id": "<id>", "imageIndices": [0, 2, 5] }, ... ],
         "allImages": [ "data:image/jpeg;base64,...", "data:image/jpeg;base64,...", ... ],
         "model": "gpt-4o-mini",   // optional
         "max_tokens": 300         // optional
      }
    For each group, builds a prompt using the images (referenced by their indices from allImages)
    and calls the OpenAI API to generate a detailed description.
    Returns an array of objects:
      [
         { "marker_id": "<id>", "description": "...", "imageIndices": [0,2,5] },
         ...
      ]
    """
    data = request.json
    groupings = data.get("groupings", [])
    all_images = data.get("allImages", [])
    model = data.get("model", "gpt-4o-mini")
    max_tokens = data.get("max_tokens", 300)

    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        return jsonify({"error": "Missing OPENAI_API_KEY"}), 500

    group_results = []
    for group in groupings:
        imageIndices = group.get("imageIndices", [])
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "You are an expert jewelry marketer. Based on the following images of a single jewelry item, generate a concise, marketing-friendly description for the item. Do not use markdown, just plain text."
                    }
                ] + [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": all_images[i],
                            "detail": "low"
                        }
                    } for i in imageIndices if i < len(all_images)
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
            "marker_id": group.get("marker_id", "unknown"),
            "description": description,
            "imageIndices": imageIndices
        })
    return jsonify(group_results)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
