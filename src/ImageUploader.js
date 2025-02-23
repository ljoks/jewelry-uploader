import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import exifr from 'exifr';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import './ImageUploader.css';

const ImageUploader = () => {
  const [files, setFiles] = useState([]);
  // Each group is an array of image objects.
  const [groups, setGroups] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});

  // onDrop handler for react-dropzone
  const onDrop = useCallback(async (acceptedFiles) => {
    const processedFiles = await Promise.all(acceptedFiles.map(async (file) => {
      const url = URL.createObjectURL(file);
      let dateTime;
      try {
        const exifData = await exifr.parse(file);
        dateTime = exifData && (exifData.DateTimeOriginal || exifData.CreateDate)
          ? new Date(exifData.DateTimeOriginal || exifData.CreateDate)
          : new Date(file.lastModified);
      } catch (err) {
        dateTime = new Date(file.lastModified);
      }
      return { file, url, dateTime, id: `${file.name}-${file.lastModified}-${Math.random()}` };
    }));

    // Update files state
    setFiles(prev => [...prev, ...processedFiles]);

    // Auto-grouping based on timestamp
    const allFiles = [...files, ...processedFiles].sort((a, b) => a.dateTime - b.dateTime);
    const threshold = 300000; // 5 minutes
    const newGroups = [];
    let currentGroup = [];
    allFiles.forEach((img) => {
      if (currentGroup.length === 0) {
        currentGroup.push(img);
      } else {
        const lastImg = currentGroup[currentGroup.length - 1];
        if (img.dateTime - lastImg.dateTime <= threshold) {
          currentGroup.push(img);
        } else {
          newGroups.push(currentGroup);
          currentGroup = [img];
        }
      }
    });
    if (currentGroup.length > 0) {
      newGroups.push(currentGroup);
    }
    setGroups(newGroups);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: 'image/*',
    multiple: true
  });

  // onDragEnd handles moving images between groups.
  const onDragEnd = (result) => {
    const { source, destination } = result;
    // If dropped outside a droppable area, do nothing.
    if (!destination) return;

    // Create a deep copy of groups for manipulation.
    const updatedGroups = groups.map(group => Array.from(group));
    
    // Remove the item from its source group.
    const [movedItem] = updatedGroups[source.droppableId].splice(source.index, 1);

    // Insert the item into the destination group.
    updatedGroups[destination.droppableId].splice(destination.index, 0, movedItem);

    // Remove any group that has become empty.
    const cleanedGroups = updatedGroups.filter(group => group.length > 0);

    setGroups(cleanedGroups);
  };

  // Dummy upload simulation to illustrate progress indicator.
  const simulateUpload = (fileId) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
      if (progress >= 100) {
        clearInterval(interval);
      }
    }, 100);
  };

  // Simulate upload for each new file.
  files.forEach(fileObj => {
    if (!uploadProgress[fileObj.id]) {
      simulateUpload(fileObj.id);
    }
  });

  // Handler for adding a new empty group.
  const addNewGroup = () => {
    setGroups(prev => [...prev, []]);
  };

  // Handler for confirming groupings and sending to n8n (placeholder).
  const handleConfirm = async () => {
    // Prepare payload for n8n: convert groups into a simple JSON format.
    const payload = { groups: groups.map(group => group.map(img => ({ url: img.url, dateTime: img.dateTime }))) };

    try {
      const response = await fetch('http://localhost:5678/webhook-test/confirm-groupings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        alert('Groupings confirmed and sent for processing!');
      } else {
        alert('Error submitting your groupings.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Network error occurred.');
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h2>Jewelry Bulk Upload</h2>
      </div>
      <div {...getRootProps({ className: 'upload-area' })}>
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the images here ...</p>
        ) : (
          <p>Drag & drop images here, or click to select files</p>
        )}
      </div>

      {groups.length > 0 && (
        <>
          <h3>Image Groups (Based on Timestamps)</h3>
          <DragDropContext onDragEnd={onDragEnd}>
            {groups.map((group, groupIndex) => (
              <Droppable droppableId={`${groupIndex}`} key={groupIndex}>
                {(provided) => (
                  <div
                    className="group-container"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    <div className="group-header">Group {groupIndex + 1}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                      {group.map((img, index) => (
                        <Draggable key={img.id} draggableId={img.id} index={index}>
                          {(provided) => (
                            <div
                              className="thumbnail"
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <img src={img.url} alt={`Uploaded ${index}`} />
                              {uploadProgress[img.id] && (
                                <div
                                  className="progress-bar"
                                  style={{ width: `${uploadProgress[img.id]}%` }}
                                />
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </DragDropContext>
          <button onClick={addNewGroup}>Add New Group</button>
          <button onClick={handleConfirm} style={{ marginLeft: '10px' }}>Confirm Groupings</button>
        </>
      )}
    </div>
  );
};

export default ImageUploader;
