import cv2 as cv
import numpy as np
import os
import sys
from glob import glob

def generate_aruco_marker_with_outline(marker_id, marker_size=100, border_thickness=10):
    """
    Generates an ArUco marker with a white outline (border) around it.
    """
    dictionary = cv.aruco.getPredefinedDictionary(cv.aruco.DICT_4X4_50)

    # Marker without border
    inner_marker_size = marker_size - 2 * border_thickness
    inner_marker = np.zeros((inner_marker_size, inner_marker_size), dtype=np.uint8)
    cv.aruco.generateImageMarker(dictionary, marker_id, inner_marker_size, inner_marker)

    # Create larger canvas with border
    marker_with_border = np.full((marker_size, marker_size), 255, dtype=np.uint8)  # Full white background
    marker_with_border[border_thickness:border_thickness+inner_marker_size,
                       border_thickness:border_thickness+inner_marker_size] = inner_marker

    # Convert to BGR
    marker_bgr = cv.cvtColor(marker_with_border, cv.COLOR_GRAY2BGR)

    return marker_bgr

def process_folder(input_folder, output_folder, marker_id, marker_size=100):
    """
    Process all images in a folder, placing the specified ArUco marker with white outline
    in the bottom-right corner of each image.
    """
    os.makedirs(output_folder, exist_ok=True)

    # Generate marker with outline
    marker_bgr = generate_aruco_marker_with_outline(marker_id, marker_size)

    # Collect images (JPG and PNG)
    image_paths = glob(os.path.join(input_folder, '*.jpg')) + glob(os.path.join(input_folder, '*.png'))

    margin = 10  # Space from the edge

    for img_path in image_paths:
        image = cv.imread(img_path)
        if image is None:
            print(f"Skipping {img_path}: Unable to read image.")
            continue

        img_h, img_w = image.shape[:2]

        if img_w < marker_size + margin or img_h < marker_size + margin:
            print(f"Skipping {img_path}: Image too small for marker.")
            continue

        # Place in bottom-right
        x_offset = img_w - marker_size - margin
        y_offset = img_h - marker_size - margin

        # Overlay marker (replace pixels)
        image[y_offset:y_offset+marker_size, x_offset:x_offset+marker_size] = marker_bgr

        # Save to output folder, preserving filename
        output_path = os.path.join(output_folder, os.path.basename(img_path))
        cv.imwrite(output_path, image)

        print(f"Added marker {marker_id} to {img_path} -> {output_path}")

def process_all_subfolders(base_folder, output_base_folder):
    """
    Traverse all subfolders inside base_folder.
    Assign each subfolder a unique ArUco marker ID, starting at 0.
    """
    subfolders = [f.path for f in os.scandir(base_folder) if f.is_dir()]
    subfolders.sort()  # Optional, ensures order is consistent if needed.

    if not subfolders:
        print("No subfolders found.")
        return

    for marker_id, subfolder in enumerate(subfolders):
        subfolder_name = os.path.basename(subfolder)
        output_folder = os.path.join(output_base_folder, subfolder_name)

        print(f"Processing folder: {subfolder} with marker ID: {marker_id}")
        process_folder(subfolder, output_folder, marker_id)

    print("All folders processed.")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python script.py <base_folder>")
        sys.exit(1)

    base_folder = sys.argv[1]
    output_base_folder = os.path.join(base_folder, 'output')

    print(f"Starting processing for base folder: {base_folder}")
    process_all_subfolders(base_folder, output_base_folder)
