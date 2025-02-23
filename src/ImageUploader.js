import React, { useState } from 'react';
import exifr from 'exifr';

const ImageUploader = () => {
  const [images, setImages] = useState([]);
  const [groups, setGroups] = useState([]);

  // Handle file upload and extract EXIF metadata to get capture time
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    const imagesWithData = await Promise.all(files.map(async file => {
      // Create a URL for previewing the image
      const url = URL.createObjectURL(file);
      // Try to extract the original date/time from EXIF data
      const exifData = await exifr.parse(file);
      // Fallback to file lastModified if no EXIF data is found
      const dateTime = exifData && (exifData.DateTimeOriginal || exifData.CreateDate)
        ? new Date(exifData.DateTimeOriginal || exifData.CreateDate)
        : new Date(file.lastModified);
      return { file, url, dateTime };
    }));

    // Sort images by timestamp
    imagesWithData.sort((a, b) => a.dateTime - b.dateTime);

    // Group images that were captured within 5 minutes (300000 ms) of each other
    const threshold = 300000; // 5 minutes in milliseconds
    let currentGroup = [];
    const groupsResult = [];
    imagesWithData.forEach(img => {
      if (currentGroup.length === 0) {
        currentGroup.push(img);
      } else {
        const lastImg = currentGroup[currentGroup.length - 1];
        if (img.dateTime - lastImg.dateTime <= threshold) {
          currentGroup.push(img);
        } else {
          groupsResult.push(currentGroup);
          currentGroup = [img];
        }
      }
    });
    if (currentGroup.length > 0) {
      groupsResult.push(currentGroup);
    }

    setImages(imagesWithData);
    setGroups(groupsResult);
  };

  // Allow user to move an image from one group to another
  const handleGroupChange = (sourceGroupIndex, targetGroupIndex, imgIndex) => {
    const updatedGroups = groups.map((group, idx) => [...group]);
    const [movedImage] = updatedGroups[sourceGroupIndex].splice(imgIndex, 1);
    // If targetGroupIndex equals the current number of groups, create a new group
    if (targetGroupIndex === updatedGroups.length) {
      updatedGroups.push([movedImage]);
    } else {
      updatedGroups[targetGroupIndex].push(movedImage);
    }
    setGroups(updatedGroups);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Bulk Upload Jewelry Images</h2>
      <input type="file" accept="image/*" multiple onChange={handleFileChange} />

      {groups.length > 0 && (
        <>
          <h3>Suggested Groupings (Based on Timestamps)</h3>
          {groups.map((group, gIndex) => (
            <div
              key={gIndex}
              style={{
                border: '1px solid #ccc',
                margin: '10px 0',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              <h4>Group {gIndex + 1}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {group.map((img, iIndex) => (
                  <div
                    key={iIndex}
                    style={{
                      margin: '5px',
                      textAlign: 'center',
                      width: '120px'
                    }}
                  >
                    <img
                      src={img.url}
                      alt={`Uploaded ${iIndex}`}
                      style={{
                        width: '100px',
                        height: '100px',
                        objectFit: 'cover',
                        borderRadius: '4px'
                      }}
                    />
                    <p style={{ fontSize: '0.75rem' }}>
                      {img.dateTime.toLocaleTimeString()}
                    </p>
                    <div>
                      <label htmlFor={`group-select-${gIndex}-${iIndex}`}>
                        Move to:
                      </label>
                      <select
                        id={`group-select-${gIndex}-${iIndex}`}
                        onChange={(e) =>
                          handleGroupChange(
                            gIndex,
                            parseInt(e.target.value),
                            iIndex
                          )
                        }
                        defaultValue={gIndex}
                      >
                        {groups.map((_, idx) => (
                          <option key={idx} value={idx}>
                            Group {idx + 1}
                          </option>
                        ))}
                        <option value={groups.length}>New Group</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default ImageUploader;

