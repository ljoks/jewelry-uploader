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
  Grid,
  CircularProgress,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { styled } from '@mui/system';

// Styled components
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

// Utility to convert a File to a Base64-encoded string.
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });

const ImageUploader = () => {
  const [page, setPage] = useState('upload'); // 'upload' or 'listings'
  const [files, setFiles] = useState([]); // Array of { file, url, dateTime, id }
  const [uploadProgress, setUploadProgress] = useState({});
  // Listings will be returned from the API in the format:
  // [ { marker_id, description, imageIndices: [ ... ] }, ... ]
  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);

  // onDrop: accepts only JPEG and PNG files.
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
        return {
          file,
          url,
          dateTime,
          id: `${file.name}-${file.lastModified}-${Math.random()}`,
        };
      })
    );
    setFiles((prev) => [...prev, ...processedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: 'image/jpeg, image/png',
    multiple: true,
  });

  // Allow drag & drop reordering of uploaded images.
  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const updatedFiles = Array.from(files);
    const [removed] = updatedFiles.splice(source.index, 1);
    updatedFiles.splice(destination.index, 0, removed);
    setFiles(updatedFiles);
  };

  // Delete an image from the list.
  const handleDeleteImage = (index) => {
    const updatedFiles = Array.from(files);
    updatedFiles.splice(index, 1);
    setFiles(updatedFiles);
  };

  // Dummy upload progress simulation.
  const simulateUpload = (fileId) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress((prev) => ({ ...prev, [fileId]: progress }));
      if (progress >= 100) clearInterval(interval);
    }, 100);
  };

  files.forEach((fileObj) => {
    if (!uploadProgress[fileObj.id]) {
      simulateUpload(fileObj.id);
    }
  });

  // When the user clicks "Confirm Groupings," convert each file to Base64,
  // then call the serverless endpoint to process markers, group images,
  // and generate descriptions.
  const handleConfirm = async () => {
    if (files.length === 0) {
      alert("No images uploaded!");
      return;
    }
    setLoadingListings(true);
    try {
      // Convert each file to Base64.
      const base64Images = await Promise.all(
        files.map(async (img) => await fileToBase64(img.file))
      );
      // Build payload.
      const payload = {
        images: base64Images,
        model: "gpt-4o-mini",
        max_tokens: 300,
      };

      // Call the API endpoint.
      const response = await fetch('http://localhost:5000/api/generateGroupingAndDescriptions', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      const result = await response.json();
      // The API returns an array of groups, each with marker_id, description, and imageIndices.
      console.log(result);
      // setListings(result);
      // setPage("listings");
    } catch (error) {
      console.error("Error generating groups and descriptions:", error);
      alert("Error generating groupings and descriptions. Please try again.");
    } finally {
      // setLoadingListings(false);
    }
  };

  // Render the upload page.
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
            <DragDropContext onDragEnd={onDragEnd}>
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
                                {uploadProgress[img.id] !== undefined && (
                                  <LinearProgress variant="determinate" value={uploadProgress[img.id]} />
                                )}
                              </CardContent>
                            </ThumbnailCard>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteImage(index)}
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
            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button variant="contained" onClick={handleConfirm}>
                Confirm Groupings
              </Button>
              {loadingListings && <CircularProgress size={24} sx={{ ml: 2 }} />}
            </Box>
          </>
        )}
      </Container>
    </>
  );

  // Render the fake auction listings page.
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
                  src={files[imageIndex].url}
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

  return page === "upload" ? renderUpload() : renderListings();
};

export default ImageUploader;
