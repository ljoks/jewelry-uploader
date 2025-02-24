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

// Utility: Convert a File object to a Base64 string.
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]); // return only the base64 string without "data:image/..."
    reader.onerror = (error) => reject(error);
  });

const ImageUploader = () => {
  // "page" can be "upload" or "listings"
  const [page, setPage] = useState('upload');
  const [files, setFiles] = useState([]);
  // groups: an array of arrays of image objects. Each object contains: file, url, dateTime, id.
  const [groups, setGroups] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  // listings: array of objects { description, images, groupIndex } for fake auction listings.
  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);

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
    setFiles((prev) => [...prev, ...processedFiles]);

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
    multiple: true,
  });

  // onDragEnd: Allow moving images between groups.
  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const updatedGroups = groups.map((group) => Array.from(group));
    const [movedItem] = updatedGroups[source.droppableId].splice(source.index, 1);
    updatedGroups[destination.droppableId].splice(destination.index, 0, movedItem);
    const cleanedGroups = updatedGroups.filter((group) => group.length > 0);
    setGroups(cleanedGroups);
  };

  // Dummy upload simulation for progress indicator.
  const simulateUpload = (fileId) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress((prev) => ({ ...prev, [fileId]: progress }));
      if (progress >= 100) {
        clearInterval(interval);
      }
    }, 100);
  };

  // Simulate upload for each new file.
  files.forEach((fileObj) => {
    if (!uploadProgress[fileObj.id]) {
      simulateUpload(fileObj.id);
    }
  });

  // Handler for adding a new empty group.
  const addNewGroup = () => {
    setGroups((prev) => [...prev, []]);
  };

  // Function to generate a description for a single group using GPT-4o.
  const generateDescriptionForGroup = async (group) => {
    // Convert each file to Base64
    const base64Images = await Promise.all(
      group.map(async (img) => {
        const base64 = await fileToBase64(img.file);
        return `data:image/jpeg;base64,${base64}`;
      })
    );

    // Build the messages array.
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are a jewelry seller creating a posting for the liveauctioneers website 
            to sell this piece of jewelry. Create a concise description of this jewelry based on the following images.
            Do not use markdown, just plain text.`,
          },
          ...base64Images.map((b64) => ({
            type: 'image_url',
            image_url: {
              url: b64,
              detail: 'low',
            },
          })),
        ],
      },
    ];

    // Build the API payload.
    const data = {
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 300,
    };

    // Call the OpenAI API.
    const response = await fetch('/api/generateDescription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), // data contains model, messages, max_tokens, etc.
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const responseJson = await response.json();
    const detailedDescription = responseJson.choices[0].message.content;
    return detailedDescription + ` All photos represent the lot condition and may contain unseen 
    imperfections in addition to the information provided. All items are described to the best of our abilities. 
    Please communicate all questions and concerns prior to bidding. Please read our terms and conditions for more 
    details. Good luck bidding.`;
  };

  // Handler for confirming groupings. For each group, get AI-generated description.
  const handleConfirm = async () => {
    setLoadingListings(true);
    try {
      // For each group, call the API.
      const listingsData = await Promise.all(
        groups.map(async (group, index) => {
          const description = await generateDescriptionForGroup(group);
          return { groupIndex: index, description, images: group };
        })
      );
      setListings(listingsData);
      // Move to the fake auction listing page.
      setPage('listings');
    } catch (error) {
      console.error('Error generating descriptions:', error);
      alert('There was an error generating the descriptions. Please try again.');
    } finally {
      setLoadingListings(false);
    }
  };

  // Render the fake auction listings page.
  const renderListings = () => (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Fake Auction Listings
      </Typography>
      {listings.map((listing) => (
        <Paper key={listing.groupIndex} sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">Jewelry Item {listing.groupIndex + 1}</Typography>
          <Grid container spacing={2}>
            {listing.images.map((img) => (
              <Grid item xs={4} key={img.id}>
                <img src={img.url} alt="Thumbnail" style={{ width: '100%', borderRadius: '4px' }} />
              </Grid>
            ))}
          </Grid>
          <Typography variant="body1" sx={{ my: 1 }}>
            {listing.description}
          </Typography>
        </Paper>
      ))}
      <Button variant="contained" onClick={() => setPage('upload')} sx={{ mt: 2 }}>
        Back to Upload
      </Button>
    </Container>
  );

  // Render the upload & grouping page.
  const renderUpload = () => (
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
                        <GroupContainer ref={provided.innerRef} {...provided.droppableProps}>
                          <Typography variant="subtitle1" sx={{ mb: 1 }}>
                            Group {groupIndex + 1}
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                            {group.map((img, index) => (
                              <Draggable key={img.id} draggableId={img.id} index={index}>
                                {(provided) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
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
              {loadingListings && <CircularProgress size={24} sx={{ ml: 2 }} />}
            </Box>
          </>
        )}
      </Container>
    </>
  );

  return page === 'upload' ? renderUpload() : renderListings();
};

export default ImageUploader;
