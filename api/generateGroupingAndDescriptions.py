import base64
import cv2
import numpy as np
import json
import os
import requests

def process_image_marker(base64_data_url):
    """
    Process a Base64 image containing an ArUco marker.
    Returns a tuple (marker_id, cleaned_data_url) where:
      - marker_id: the detected marker's ID (an integer), or None if not detected.
      - cleaned_data_url: the cleaned image (with the marker removed) as a Base64 data URL.
    """
    try:
        # Remove data URL prefix if present.
        if base64_data_url.startswith("data:image"):
            base64_str = base64_data_url.split(",")[1]
        else:
            base64_str = base64_data_url
        # Decode Base64 to bytes, then to NumPy array and image.
        img_data = base64.b64decode(base64_str)
        np_arr = np.frombuffer(img_data, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if image is None:
            return (None, base64_data_url)
        
        # Convert to grayscale.
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Load ArUco dictionary and detector parameters.
        aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
        parameters = cv2.aruco.DetectorParameters_create()
        
        # Detect markers.
        corners, ids, _ = cv2.aruco.detectMarkers(gray, aruco_dict, parameters=parameters)
        marker_id = None
        if ids is not None and len(ids) > 0:
            marker_id = int(ids[0][0])  # Take the first detected marker's ID.
            # Create a mask covering all detected marker regions.
            marker_mask = np.zeros(gray.shape, dtype=np.uint8)
            for marker_corners in corners:
                pts = marker_corners.reshape((4, 2)).astype(np.int32)
                cv2.fillConvexPoly(marker_mask, pts, 255)
            # Dilate the mask to ensure complete marker coverage.
            kernel = np.ones((5, 5), np.uint8)
            marker_mask = cv2.dilate(marker_mask, kernel, iterations=1)
            # Inpaint the marker regions.
            image = cv2.inpaint(image, marker_mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
        
        # Encode the cleaned image back to JPEG.
        retval, buffer = cv2.imencode('.jpg', image)
        if not retval:
            return (marker_id, base64_data_url)
        cleaned_base64 = base64.b64encode(buffer).decode('utf-8')
        cleaned_data_url = "data:image/jpeg;base64," + cleaned_base64
        return (marker_id, cleaned_data_url)
    except Exception as e:
        print("Error in process_image_marker:", e)
        return (None, base64_data_url)

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
    if event["httpMethod"] != "POST":
        return {
            "statusCode": 405,
            "body": json.dumps({"error": "Method Not Allowed"})
        }
    
    try:
        payload = json.loads(event["body"])
    except Exception as e:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON payload"})
        }
    
    images = payload.get("images", [])
    model = payload.get("model", "gpt-4o-mini")
    max_tokens = payload.get("max_tokens", 300)
    
    processed_images = []
    # Process each image: detect marker and remove it.
    for img_data_url in images:
        marker_id, cleaned_data_url = process_image_marker(img_data_url)
        processed_images.append({
            "marker_id": marker_id,
            "cleaned_image": cleaned_data_url
        })
    
    # Group images by marker_id.
    groups = {}
    for idx, img in enumerate(processed_images):
        key = str(img["marker_id"]) if img["marker_id"] is not None else "unknown"
        if key not in groups:
            groups[key] = []
        groups[key].append({
            "index": idx,
            "image": img["cleaned_image"]
        })
    
    # For each group, build a prompt and call GPT‑4o to generate a description.
    group_results = []
    for marker_key, images_group in groups.items():
        # Build the messages array for this group.
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "You are an expert jewelry marketer. Based on the following images (which have had a marker removed) of a single jewelry item, generate a detailed, marketing-friendly description for the item."
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
        
        # Build the payload for the OpenAI API call.
        openai_payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens
        }
        
        OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
        if not OPENAI_API_KEY:
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "OpenAI API key not configured."})
            }
        
        openai_response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}"
            },
            json=openai_payload
        )
        
        if openai_response.status_code != 200:
            error_text = openai_response.text
            return {
                "statusCode": openai_response.status_code,
                "body": json.dumps({"error": error_text})
            }
        
        openai_data = openai_response.json()
        description = openai_data["choices"][0]["message"]["content"]
        
        group_results.append({
            "marker_id": marker_key,
            "description": description,
            "imageIndices": [img["index"] for img in images_group]
        })
    
    return {
        "statusCode": 200,
        "body": json.dumps(group_results)
    }
