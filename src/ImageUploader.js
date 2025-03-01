import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
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
  Grid,
  CircularProgress,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { styled } from '@mui/system';

// Styled components for a modern look.
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

const ThumbnailCard = styled(Card)(({ theme }) => ({
  width: 120,
  margin: theme.spacing(1),
  position: 'relative',
}));

// Utility: Convert a File object to a Base64 string.
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });

const ImageUploader = () => {
  // page state: 'upload', 'review', or 'listings'
  const [page, setPage] = useState('upload');

  // Files uploaded by the user. Each file: { file, url, id }.
  const [files, setFiles] = useState([]);
  // Full list of cleaned images (Base64 strings) returned from the grouping API.
  const [cleanedImages, setCleanedImages] = useState([]);
  // Groups returned from /api/groupImages.
  // Each group: { marker_id, images: [ { index, image } ] }.
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  // Listings returned from /api/generateDescriptions.
  const [listings, setListings] = useState([]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: useCallback(async (acceptedFiles) => {
      const processedFiles = await Promise.all(
        acceptedFiles.map(async (file) => {
          const url = URL.createObjectURL(file);
          return { file, url, id: `${file.name}-${file.lastModified}-${Math.random()}` };
        })
      );
      setFiles((prev) => [...prev, ...processedFiles]);
    }, []),
    accept: 'image/jpeg, image/png',
    multiple: true,
  });

  // Reordering on the upload page.
  const onDragEndUpload = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const updatedFiles = Array.from(files);
    const [removed] = updatedFiles.splice(source.index, 1);
    updatedFiles.splice(destination.index, 0, removed);
    setFiles(updatedFiles);
  };

  // Reordering on the review page (between groups).
  const onDragEndGroups = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const updatedGroups = groups.map((group) => ({ ...group, images: Array.from(group.images) }));
    const [movedItem] = updatedGroups[source.droppableId].images.splice(source.index, 1);
    updatedGroups[destination.droppableId].images.splice(destination.index, 0, movedItem);
    const cleanedGroups = updatedGroups.filter((group) => group.images.length > 0);
    setGroups(cleanedGroups);
  };

  // Delete a file from the upload list.
  const handleDeleteFile = (index) => {
    const updatedFiles = Array.from(files);
    updatedFiles.splice(index, 1);
    setFiles(updatedFiles);
  };

  // Delete an image from a group.
  const handleDeleteGroupImage = (groupIndex, imgIndex) => {
    const updatedGroups = groups.map((group) => ({ ...group, images: Array.from(group.images) }));
    updatedGroups[groupIndex].images.splice(imgIndex, 1);
    const cleanedGroups = updatedGroups.filter((group) => group.images.length > 0);
    setGroups(cleanedGroups);
  };

  // Simulated upload progress (for UI purposes).
  const simulateUpload = (fileId) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      // Here we simply set progress to 100 immediately.
      // You can add logic for real upload progress if needed.
      if (progress >= 100) {
        clearInterval(interval);
      }
    }, 100);
  };

  files.forEach((fileObj) => {
    simulateUpload(fileObj.id);
  });

  // STEP 1: Grouping Phase - Call /api/groupImages.
  const handleGroupImages = async () => {
    if (files.length === 0) {
      alert("No images uploaded!");
      return;
    }
    setLoading(true);
    try {
      // Convert each file to Base64.
      const base64Images = await Promise.all(files.map(async (img) => await fileToBase64(img.file)));
      // Call the grouping endpoint.
      const payload = { images: base64Images };
      const response = await fetch('http://localhost:5000/api/groupImages', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      const groupData = await response.json();
      
      // Reconstruct the cleanedImages array from groupData.
      // groupData is an array of groups; each group.images is an array with { index, image }.
      const newCleanedImages = [...base64Images]; // default to original Base64 images
      groupData.forEach(group => {
        group.images.forEach(imgObj => {
          newCleanedImages[imgObj.index] = imgObj.image; // update with cleaned image from backend
        });
      });
      setCleanedImages(newCleanedImages);
      setGroups(groupData);
      setPage("review");
    } catch (error) {
      console.error("Error grouping images:", error);
      alert("Error grouping images. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Description Generation Phase - Call /api/generateDescriptions.
  const handleGenerateDescriptions = async () => {
    if (groups.length === 0) {
      alert("No groups available!");
      return;
    }
    setLoading(true);
    try {
      // Build groupings payload: for each group, send marker_id and imageIndices.
      const groupings = groups.map(group => ({
        marker_id: group.marker_id,
        imageIndices: group.images.map(img => img.index)
      }));
      const payload = {
        groupings,
        allImages: cleanedImages, // use the cleaned images from grouping step.
        model: "gpt-4o-mini",
        max_tokens: 300,
      };
      const response = await fetch('http://localhost:5000/api/generateDescriptions', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      const listingsData = await response.json();
      setListings(listingsData);
      setPage("listings");
    } catch (error) {
      console.error("Error generating descriptions:", error);
      alert("Error generating descriptions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Render the Upload page.
  const renderUpload = () => (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">Jewelry Bulk Upload</Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <DropzoneArea {...getRootProps()}>
          <input {...getInputProps()} />
          {isDragActive ? (
            <Typography variant="body1">Drop the images here...</Typography>
          ) : (
            <Typography variant="body1">
              Drag & drop images here, or click to select JPEG or PNG files
            </Typography>
          )}
        </DropzoneArea>
        {files.length > 0 && (
          <>
            <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
              Uploaded Images
            </Typography>
            <DragDropContext onDragEnd={onDragEndUpload}>
              <Droppable droppableId="files-droppable" direction="horizontal">
                {(provided) => (
                  <Box
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    sx={{ display: 'flex', overflowX: 'auto', p: 1 }}
                  >
                    {files.map((img, index) => (
                      <Draggable key={img.id} draggableId={img.id} index={index}>
                        {(provided) => (
                          <Box
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            sx={{ position: 'relative', mr: 1 }}
                          >
                            <ThumbnailCard>
                              <CardMedia
                                component="img"
                                height="100"
                                image={img.url}
                                alt={`Uploaded ${index}`}
                              />
                              <CardContent sx={{ p: 1 }}>
                                <LinearProgress variant="determinate" value={100} />
                              </CardContent>
                            </ThumbnailCard>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteFile(index)}
                              sx={{ position: 'absolute', top: 0, right: 0 }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </Box>
                )}
              </Droppable>
            </DragDropContext>
            <Box sx={{ mt: 2 }}>
              <Button variant="contained" onClick={handleGroupImages} disabled={loading}>
                {loading ? <CircularProgress size={24} /> : "Group Images"}
              </Button>
            </Box>
          </>
        )}
      </Container>
    </>
  );

  // Render the Review Groups page.
  const renderReview = () => (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">Review Image Groups</Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Adjust Groups if Needed
        </Typography>
        <DragDropContext onDragEnd={onDragEndGroups}>
          <Grid container spacing={2}>
            {groups.map((group, groupIndex) => (
              <Grid item xs={12} md={6} key={groupIndex}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle1">
                    Group {groupIndex + 1} (Marker: {group.marker_id})
                  </Typography>
                  <Droppable droppableId={`${groupIndex}`} direction="horizontal">
                    {(provided) => (
                      <Box
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        sx={{ display: 'flex', overflowX: 'auto', p: 1 }}
                      >
                        {group.images.map((img, index) => (
                          <Draggable key={img.index} draggableId={`${img.index}`} index={index}>
                            {(provided) => (
                              <Box
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                sx={{ position: 'relative', mr: 1 }}
                              >
                                <ThumbnailCard>
                                  <CardMedia
                                    component="img"
                                    height="100"
                                    image={img.image}
                                    alt={`Group ${groupIndex} - Image ${img.index}`}
                                  />
                                  <CardContent sx={{ p: 1 }}>
                                    <LinearProgress variant="determinate" value={100} />
                                  </CardContent>
                                </ThumbnailCard>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteGroupImage(groupIndex, index)}
                                  sx={{ position: 'absolute', top: 0, right: 0 }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </Box>
                    )}
                  </Droppable>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </DragDropContext>
        <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
          <Button variant="outlined" onClick={() => setPage("upload")}>
            Back to Upload
          </Button>
          <Button variant="contained" onClick={handleGenerateDescriptions} disabled={loading}>
            {loading ? <CircularProgress size={24} /> : "Generate Descriptions"}
          </Button>
        </Box>
      </Container>
    </>
  );

  // Render the Listings page.
  const renderListings = () => (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Fake Auction Listings
      </Typography>
      {listings.map((listing, idx) => (
        <Paper key={idx} sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">
            Jewelry Item {idx + 1} (Marker: {listing.marker_id})
          </Typography>
          <Typography variant="body1" sx={{ my: 1 }}>
            {listing.description}
          </Typography>
          <Grid container spacing={2}>
            {listing.imageIndices.map((imageIndex) => (
              <Grid item xs={4} key={imageIndex}>
                <img
                  src={cleanedImages[imageIndex]}
                  alt={`Item ${idx} - Image ${imageIndex}`}
                  style={{ width: '100%', borderRadius: '4px' }}
                />
              </Grid>
            ))}
          </Grid>
        </Paper>
      ))}
      <Button variant="contained" onClick={() => setPage('upload')} sx={{ mt: 2 }}>
        Back to Upload
      </Button>
    </Container>
  );

  return page === 'upload'
    ? renderUpload()
    : page === 'review'
    ? renderReview()
    : renderListings();
};

export default ImageUploader;
