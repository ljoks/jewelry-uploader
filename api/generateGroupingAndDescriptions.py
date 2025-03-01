import base64
import cv2
import numpy as np
import json
import os
import requests

# ---- Utility function (your marker detection and removal) ----
def process_image_marker(base64_data_url):
    """
    Given a Base64 data URL of an image, detect an ArUco marker (using DICT_4X4_250),
    and if detected, crop out the marker from the image. Returns a tuple:
      (marker_id, cropped_data_url)
    If no marker is detected, returns (None, original_data_url).
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

    # Instantiate the ArucoDetector using the new API.
    dictionary = cv.aruco.getPredefinedDictionary(cv.aruco.DICT_4X4_250)
    parameters = cv.aruco.DetectorParameters()
    detector = cv.aruco.ArucoDetector(dictionary, parameters)

    markerCorners, markerIds, rejectedCandidates = detector.detectMarkers(gray)

    marker_id = None
    if markerIds is not None and len(markerIds) > 0:
        marker_id = int(markerIds[0][0])  # Take the first detected marker's ID.
        # Get the bounding box of the marker.
        corners = markerCorners[0]  # shape: (1, 4, 2)
        pts = corners.reshape((4, 2)).astype(np.int32)
        x, y, w, h = cv.boundingRect(pts)

        # Assume marker is in the bottom-right. Crop out the marker region.
        # For example, crop the image from the top-left up to (image_width - marker_width, image_height - marker_height).
        img_height, img_width = image.shape[:2]
        # Check if the marker is approximately in the bottom-right corner.
        if x > img_width * 0.5 and y > img_height * 0.5:
            new_width = x  # crop away the marker from the right side.
            new_height = y  # crop away the marker from the bottom.
            # Option 1: Crop the image entirely to the top-left region.
            cropped_image = image[0:new_height, 0:new_width]
            # Option 2: Alternatively, you might choose to crop only a small margin around the marker.
            # Adjust this logic based on your needs.
        else:
            # If the marker isn't in the expected position, fall back to the original image.
            cropped_image = image
    else:
        cropped_image = image

    # Encode the (cropped) image back to JPEG and then to Base64.
    retval, buffer = cv.imencode('.jpg', cropped_image)
    if not retval:
        return marker_id, base64_data_url
    cleaned_base64 = base64.b64encode(buffer).decode('utf-8')
    cropped_data_url = "data:image/jpeg;base64," + cleaned_base64

    return marker_id, cropped_data_url

def handler(event, context):
    """
    Serverless function endpoint for /api/generateGroupingAndDescriptions.
    
    Expects a POST request with a JSON payload of the following format:
      {
         "images": [ "data:image/jpeg;base64,....", "data:image/jpeg;base64,....", ... ],
         "model": "gpt-4o-mini",   // optional, default provided
         "max_tokens": 300         // optional
      }
      
    The function:
      1. Processes each image to detect and remove ArUco markers.
      2. Groups images by the detected marker ID.
      3. For each group, calls the GPT‑4o API with a prompt that instructs it to generate a marketing-friendly description.
      4. Returns an array of groups with their marker ID, generated description, and image indices.
    """
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
