import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import exifr from 'exifr';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  Button,
  Card,
  CardMedia,
  CardContent,
  LinearProgress,
  Box,
  Grid
} from '@mui/material';
import { styled } from '@mui/system';

// Styled components for dropzone area and group container
const DropzoneArea = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  textAlign: 'center',
  color: theme.palette.primary.main,
  border: `2px dashed ${theme.palette.primary.main}`,
  backgroundColor: theme.palette.background.paper,
  cursor: 'pointer',
  transition: 'background-color 0.2s ease',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

const GroupContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
  backgroundColor: theme.palette.grey[50],
}));

const ThumbnailCard = styled(Card)(({ theme }) => ({
  width: 120,
  margin: theme.spacing(1),
}));

const ImageUploader = () => {
  const [files, setFiles] = useState([]);
  // Each group is an array of image objects.
  const [groups, setGroups] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});

  // onDrop handler for react-dropzone
  const onDrop = useCallback(async (acceptedFiles) => {
    const processedFiles = await Promise.all(
      acceptedFiles.map(async (file) => {
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
      })
    );

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

  // onDragEnd: Move images between groups.
  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const updatedGroups = groups.map(group => Array.from(group));
    const [movedItem] = updatedGroups[source.droppableId].splice(source.index, 1);
    updatedGroups[destination.droppableId].splice(destination.index, 0, movedItem);
    const cleanedGroups = updatedGroups.filter(group => group.length > 0);
    setGroups(cleanedGroups);
  };

  // Dummy upload simulation function for progress indicator.
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

  // Handler for confirming groupings and sending to n8n.
  const handleConfirm = async () => {
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
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div">
            Jewelry Bulk Upload
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <DropzoneArea {...getRootProps()}>
          <input {...getInputProps()} />
          {isDragActive ? (
            <Typography variant="body1">Drop the images here...</Typography>
          ) : (
            <Typography variant="body1">
              Drag & drop images here, or click to select files
            </Typography>
          )}
        </DropzoneArea>

        {groups.length > 0 && (
          <>
            <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
              Image Groups (Based on Timestamps)
            </Typography>
            <DragDropContext onDragEnd={onDragEnd}>
              <Grid container spacing={2}>
                {groups.map((group, groupIndex) => (
                  <Grid item xs={12} md={6} key={groupIndex}>
                    <Droppable droppableId={`${groupIndex}`}>
                      {(provided) => (
                        <GroupContainer
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                        >
                          <Typography variant="subtitle1" sx={{ mb: 1 }}>
                            Group {groupIndex + 1}
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                            {group.map((img, index) => (
                              <Draggable key={img.id} draggableId={img.id} index={index}>
                                {(provided) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                  >
                                    <ThumbnailCard>
                                      <CardMedia
                                        component="img"
                                        height="100"
                                        image={img.url}
                                        alt={`Image ${index}`}
                                      />
                                      <CardContent sx={{ p: 1 }}>
                                        {uploadProgress[img.id] !== undefined && (
                                          <LinearProgress variant="determinate" value={uploadProgress[img.id]} />
                                        )}
                                      </CardContent>
                                    </ThumbnailCard>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </Box>
                        </GroupContainer>
                      )}
                    </Droppable>
                  </Grid>
                ))}
              </Grid>
            </DragDropContext>
            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={addNewGroup}>
                Add New Group
              </Button>
              <Button variant="contained" onClick={handleConfirm}>
                Confirm Groupings
              </Button>
            </Box>
          </>
        )}
      </Container>
    </>
  );
};

export default ImageUploader;
