    // App.js - Final version with PPT download feature
    import React, { useState, useEffect, useRef } from 'react';
    import axios from 'axios';
    import 'bootstrap/dist/css/bootstrap.min.css';
    import './App.css';

    // Set axios base URL
    const API_BASE_URL = 'http://localhost:5000';
    axios.defaults.baseURL = API_BASE_URL;

    function App() {
        const [currentView, setCurrentView] = useState('home');
        const [lectures, setLectures] = useState([]);
        const [selectedLecture, setSelectedLecture] = useState(null);

        const fetchLectures = async () => {
            try {
                const response = await axios.get('/api/lectures');
                setLectures(response.data);
            } catch (error) {
                console.error('Error fetching lectures:', error);
            }
        };

        useEffect(() => {
            fetchLectures();
        }, []);

        const selectLecture = async (lectureId) => {
            try {
                const response = await axios.get(`/api/lectures/${lectureId}`);
                setSelectedLecture(response.data);
                setCurrentView('lecture');
            } catch (error) {
                console.error('Error fetching lecture:', error);
            }
        };

        const handleUploadSuccess = () => {
            fetchLectures();
            setCurrentView('lectures');
        }

        return (
            <div className="App">
                <nav className="navbar navbar-expand-lg sticky-top">
                    <div className="container">
                        <a className="navbar-brand" href="#" onClick={() => setCurrentView('home')}>
                            <i className="fas fa-tree me-2"></i>Study Tree
                        </a>
                        <div className="navbar-nav ms-auto">
                            <button className="btn btn-nav me-2" onClick={() => setCurrentView('home')}>
                                Home
                            </button>
                            <button className="btn btn-nav me-2" onClick={() => setCurrentView('lectures')}>
                                Lectures
                            </button>
                            <button className="btn btn-primary-solid" onClick={() => setCurrentView('upload')}>
                                <i className="fas fa-upload me-2"></i>Upload New
                            </button>
                        </div>
                    </div>
                </nav>

                <div className="main-content">
                    {currentView === 'home' && <HomeView onNavigate={setCurrentView} />}
                    {currentView === 'upload' && <UploadView onUploadSuccess={handleUploadSuccess} />}
                    {currentView === 'lectures' && <LecturesView lectures={lectures} onSelectLecture={selectLecture} fetchLectures={fetchLectures} />}
                    {currentView === 'lecture' && selectedLecture && (
                        <LectureDetailView
                            key={selectedLecture._id}
                            lecture={selectedLecture}
                            onBack={() => {
                                fetchLectures(); // Refresh list on back
                                setCurrentView('lectures');
                            }}
                        />
                    )}
                </div>
            </div>
        );
    }

    // ... (HomeView, UploadView, LecturesView remain the same)
    // Home View Component
    const HomeView = ({ onNavigate }) => (
        <div className="home-view">
            <div className="hero-section">
                <h1 className="display-4 mb-3">Learn Smarter, Not Harder.</h1>
                <p className="lead">Turn your video lectures into interactive study materials with the power of AI.</p>
                <button className="btn btn-hero mt-3" onClick={() => onNavigate('upload')}>Get Started</button>
            </div>
            <h2 className="text-center mb-5 section-title">Features</h2>
            <div className="row">
                <div className="col-md-6 col-lg-3 mb-4">
                    <div className="card feature-card">
                        <div className="icon-wrapper icon-transcription"><i className="fas fa-microphone"></i></div>
                        <h5 className="card-title mt-3">Lecture Transcription</h5>
                        <p className="card-text text-muted">Auto-generate accurate notes from any lecture video.</p>
                    </div>
                </div>
                <div className="col-md-6 col-lg-3 mb-4">
                    <div className="card feature-card">
                        <div className="icon-wrapper icon-quiz"><i className="fas fa-question-circle"></i></div>
                        <h5 className="card-title mt-3">Personalized Quizzes</h5>
                        <p className="card-text text-muted">AI creates quizzes to test your knowledge.</p>
                    </div>
                </div>
                <div className="col-md-6 col-lg-3 mb-4">
                    <div className="card feature-card">
                        <div className="icon-wrapper icon-chatbot"><i className="fas fa-robot"></i></div>
                        <h5 className="card-title mt-3">Q&A Chatbot</h5>
                        <p className="card-text text-muted">Ask questions and get instant, relevant answers.</p>
                    </div>
                </div>
                <div className="col-md-6 col-lg-3 mb-4">
                    <div className="card feature-card">
                        <div className="icon-wrapper icon-ppt"><i className="fas fa-images"></i></div>
                        <h5 className="card-title mt-3">Slide Extraction</h5>
                        <p className="card-text text-muted">Generate digital notes from your lecture slides.</p>
                    </div>
                </div>
            </div>
        </div>
    );


    // Upload View Component
    const UploadView = ({ onUploadSuccess }) => {
        const [file, setFile] = useState(null);
        const [title, setTitle] = useState('');
        const [youtubeUrl, setYoutubeUrl] = useState('');
        const [uploading, setUploading] = useState(false);
        const [uploadStatus, setUploadStatus] = useState('');
        const [uploadMethod, setUploadMethod] = useState('file'); // 'file' or 'youtube'

        const handleFileChange = (e) => {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            if (selectedFile && !title) {
                setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
            }
        };

        const handleUpload = async (e) => {
            e.preventDefault();

            if (uploadMethod === 'file' && !file) return;
            if (uploadMethod === 'youtube' && !youtubeUrl) return;

            setUploading(true);
            setUploadStatus('Initializing...');

            try {
                if (uploadMethod === 'file') {
                    const formData = new FormData();
                    formData.append('video', file);
                    formData.append('title', title);

                    await axios.post('/api/upload', formData, {
                        onUploadProgress: (progressEvent) => {
                            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                            setUploadStatus(`Uploading... ${percent}%`);
                        },
                    });
                } else {
                    setUploadStatus('Submitting YouTube link...');
                    await axios.post('/api/upload-youtube', { title, youtubeUrl });
                }

                setUploadStatus('✅ Success! Your lecture is now processing in the background.');
                setTimeout(() => {
                    onUploadSuccess();
                }, 2000);
            } catch (error) {
                console.error('Upload error:', error);
                const errorMessage = error.response?.data?.error || 'Upload failed. Please check the console and try again.';
                setUploadStatus(`❌ Error: ${errorMessage}`);
                setUploading(false); // Stop loading on error
            }
        };

        return (
            <div className="upload-view">
                <div className="card upload-card">
                    <h3 className="text-center mb-4"><i className="fas fa-cloud-upload-alt me-2"></i>Upload Lecture Video</h3>
                    <div className="btn-group w-100 mb-4" role="group">
                        <button type="button" className={`btn ${uploadMethod === 'file' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setUploadMethod('file')}>
                            <i className="fas fa-file-video me-2"></i>Upload File
                        </button>
                        <button type="button" className={`btn ${uploadMethod === 'youtube' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setUploadMethod('youtube')}>
                            <i className="fab fa-youtube me-2"></i>YouTube Link
                        </button>
                    </div>

                    <form onSubmit={handleUpload}>
                        <div className="mb-3 text-start">
                            <label htmlFor="title" className="form-label">Lecture Title</label>
                            <input type="text" className="form-control" id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                        </div>
                        {uploadMethod === 'file' ? (
                            <div className="mb-3 text-start">
                                <label htmlFor="videoFile" className="form-label">Video File</label>
                                <input type="file" className="form-control" id="videoFile" accept="video/*" onChange={handleFileChange} required={uploadMethod === 'file'} />
                            </div>
                        ) : (
                            <div className="mb-3 text-start">
                                <label htmlFor="youtubeUrl" className="form-label">YouTube URL</label>
                                <input type="url" className="form-control" id="youtubeUrl" placeholder="https://www.youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} required={uploadMethod === 'youtube'} />
                            </div>
                        )}
                        {uploadStatus && <div className={`alert ${uploadStatus.includes('Error') ? 'alert-danger' : 'alert-info'}`}>{uploadStatus}</div>}
                        <button type="submit" className="btn btn-primary-solid w-100 mt-3" disabled={uploading}>
                            {uploading ? 'Processing...' : 'Upload & Process'}
                        </button>
                    </form>
                </div>
            </div>
        );
    };


    // Lectures List View Component
    const LecturesView = ({ lectures, onSelectLecture }) => (
        <div className="lectures-view">
            <h2 className="section-title mb-5">My Lectures</h2>
            {lectures.length === 0 ? (
                <div className="text-center text-muted mt-5">
                    <i className="fas fa-video fa-3x mb-3"></i>
                    <p>You haven't uploaded any lectures yet.</p>
                </div>
            ) : (
                <div className="row">
                    {lectures.map((lecture) => (
                        <div key={lecture._id} className="col-md-6 col-lg-4 mb-4">
                            <div className="card lecture-card h-100" onClick={() => onSelectLecture(lecture._id)}>
                                <img
                                    src={lecture.thumbnail ? `${API_BASE_URL}${lecture.thumbnail}` : `https://picsum.photos/seed/${lecture._id}/400/225`}
                                    className="card-img-top lecture-thumbnail"
                                    alt="Lecture thumbnail"
                                    onError={(e) => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${lecture._id}/400/225` }}
                                />
                                <div className="card-body d-flex flex-column text-start">
                                    <h5 className="card-title">{lecture.title}</h5>
                                    <p className="card-text text-muted mt-auto mb-2">
                                        Uploaded: {new Date(lecture.uploadDate).toLocaleDateString()}
                                    </p>
                                    <div className="processing-status">
                                        {lecture.processingError ?
                                            <span className="badge bg-danger">Failed</span> :
                                            (lecture.summaryMd && lecture.transcriptMd) ?
                                                <span className="badge bg-success">Processed</span> :
                                                <span className="badge bg-warning text-dark">Processing...</span>
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );


    // Enhanced Lecture Detail View
    const LectureDetailView = ({ lecture, onBack }) => {
        const [currentTab, setCurrentTab] = useState('overview');
        const [currentLecture, setCurrentLecture] = useState(lecture);
        const [selectedAnswers, setSelectedAnswers] = useState({});
        const [chatMessages, setChatMessages] = useState([]);
        const [newMessage, setNewMessage] = useState('');
        const [isLoadingChat, setIsLoadingChat] = useState(false);
        const chatBoxRef = useRef(null);

        // Polling for status updates
        useEffect(() => {
            const isProcessing = !(currentLecture.summaryMd && currentLecture.transcriptMd) && !currentLecture.processingError;
            if (!isProcessing) return;

            const intervalId = setInterval(async () => {
                try {
                    const { data } = await axios.get(`/api/status/${lecture._id}`);
                    if (data.isComplete || data.error) {
                        clearInterval(intervalId);
                        const finalResponse = await axios.get(`/api/lectures/${lecture._id}`);
                        setCurrentLecture(finalResponse.data);
                    }
                } catch (error) {
                    console.error('Error checking status:', error);
                    clearInterval(intervalId);
                }
            }, 5000);

            return () => clearInterval(intervalId);
        }, [lecture._id, currentLecture.summaryMd, currentLecture.transcriptMd, currentLecture.processingError]);

        const handleAnswerSelect = (quizIndex, selectedOption) => {
            setSelectedAnswers(prev => ({ ...prev, [quizIndex]: selectedOption }));
        };

        const handleSendMessage = async () => {
            if (!newMessage.trim()) return;
            const userMessage = { type: 'user', content: newMessage };
            setChatMessages(prev => [...prev, userMessage]);
            setIsLoadingChat(true);
            setNewMessage('');
            try {
                const response = await axios.post(`/api/chat/${currentLecture._id}`, { question: newMessage });
                const botMessage = { type: 'bot', content: response.data.answer };
                setChatMessages(prev => [...prev, botMessage]);
            } catch (error) {
                const errorMessage = { type: 'bot', content: 'Sorry, I encountered an error.' };
                setChatMessages(prev => [...prev, errorMessage]);
            } finally {
                setIsLoadingChat(false);
            }
        };

        // --- NEW: PPT DOWNLOAD HANDLER ---
        const handleDownloadPpt = async () => {
            try {
                const response = await axios.get(`/api/lectures/${currentLecture._id}/download-ppt`, {
                    responseType: 'blob', // Important: tells axios to expect a file
                });

                // Create a URL for the blob
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;

                // Sanitize title for filename
                const fileName = `${currentLecture.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pptx`;
                link.setAttribute('download', fileName);

                // Append to DOM, click, and then remove
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);
                window.URL.revokeObjectURL(url); // Clean up the URL object

            } catch (error) {
                console.error('Error downloading PPT:', error);
                alert('Failed to download presentation. Please try again.');
            }
        };


        useEffect(() => {
            if (chatBoxRef.current) {
                chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
            }
        }, [chatMessages]);

        return (
            <div className="lecture-detail-view text-start">
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <h2 className="lecture-title">{currentLecture.title}</h2>
                    <button className="btn btn-nav" onClick={onBack}><i className="fas fa-arrow-left me-2"></i>Back</button>
                </div>

                <ul className="nav nav-tabs mb-4">
                    {['overview', 'transcript', 'summary', 'quiz', 'slides', 'chat'].map(tab => {
                        const isDisabled =
                            (tab === 'transcript' && !currentLecture.transcriptMd) ||
                            (tab === 'summary' && !currentLecture.summaryMd) ||
                            (tab === 'quiz' && !currentLecture.quizzes?.length) ||
                            (tab === 'slides' && !currentLecture.slides?.length) ||
                            (tab === 'chat' && !currentLecture.transcriptMd);
                        return (
                            <li className="nav-item" key={tab}>
                                <button className={`nav-link ${currentTab === tab ? 'active' : ''}`} onClick={() => setCurrentTab(tab)} disabled={isDisabled}>
                                    <i className={`fas ${tab === 'overview' ? 'fa-chart-bar' : tab === 'transcript' ? 'fa-file-alt' : tab === 'summary' ? 'fa-list-ul' : tab === 'quiz' ? 'fa-question-circle' : tab === 'slides' ? 'fa-images' : 'fa-comments'} me-2`}></i>
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            </li>
                        );
                    })}
                </ul>

                {/* Tab Content */}
                {currentTab === 'overview' && (
                    <div className="card tab-pane-card p-4">
                        {currentLecture.processingError ? (
                            <div className="alert alert-danger">
                                <h4>Processing Failed</h4>
                                <p>An error occurred: <code>{currentLecture.processingError}</code></p>
                            </div>
                        ) : (
                            <div className="row">
                                {['Transcription', 'Summary', 'Quiz', 'Slides'].map((item) => {
                                    const isCompleted =
                                        (item === 'Transcription' && currentLecture.transcriptMd) ||
                                        (item === 'Summary' && currentLecture.summaryMd) ||
                                        (item === 'Quiz' && currentLecture.quizzes?.length > 0) ||
                                        (item === 'Slides' && currentLecture.slides?.length > 0);
                                    return (
                                        <div className="col-md-3 mb-3" key={item}>
                                            <div className={`status-item ${isCompleted ? 'completed' : 'pending'}`}>
                                                <i className={`fas ${item === 'Transcription' ? 'fa-microphone' : item === 'Summary' ? 'fa-file-alt' : item === 'Quiz' ? 'fa-question' : 'fa-images'} mb-2 fa-2x`}></i>
                                                <div>{item}</div>
                                                <div className="status-indicator">{isCompleted ? 'Complete' : 'Pending...'}</div>
                                            </div>
                                        </div>
                                    )})}
                            </div>
                        )}
                    </div>
                )}

                {currentTab === 'transcript' && currentLecture.transcriptHtml && (
                    <div className="card tab-pane-card"><div className="card-body">
                        <h5 className="mb-3"><i className="fas fa-file-alt me-2"></i>Transcript</h5>
                        <div className="transcript-content" style={{lineHeight: '1.8'}} dangerouslySetInnerHTML={{ __html: currentLecture.transcriptHtml }} />
                    </div></div>
                )}

                {currentTab === 'summary' && currentLecture.summaryHtml && (
                    <div className="card tab-pane-card"><div className="card-body">
                        <h5 className="mb-3"><i className="fas fa-list-ul me-2"></i>Summary</h5>
                        <div className="summary-content" style={{lineHeight: '1.7'}} dangerouslySetInnerHTML={{ __html: currentLecture.summaryHtml }} />
                    </div></div>
                )}

                {currentTab === 'slides' && (
                    <div className="card tab-pane-card"><div className="card-body">
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <h5 className="mb-0"><i className="fas fa-images me-2"></i>Extracted Slides</h5>
                            {/* --- NEW: DOWNLOAD BUTTON --- */}
                            <button className="btn btn-success" onClick={handleDownloadPpt}>
                                <i className="fas fa-download me-2"></i>Download as PPT
                            </button>
                        </div>
                        <div className="row">
                            {currentLecture.slides.map((slide, index) => (
                                <div key={index} className="col-md-6 col-lg-4 mb-4">
                                    <div className="card slide-card">
                                        <img src={`${API_BASE_URL}/uploads${slide.image}`} className="card-img-top" alt={`Slide ${index + 1}`} />
                                        <div className="card-footer text-center">
                                            <small className="text-muted">
                                                <i className="fas fa-clock me-1"></i>
                                                Timestamp: {Math.floor(slide.timestamp / 60)}:{String(slide.timestamp % 60).padStart(2, '0')}
                                            </small>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div></div>
                )}

                {currentTab === 'quiz' && (
                    <div className="card tab-pane-card"><div className="card-body">
                        <h5 className="mb-4"><i className="fas fa-question-circle me-2"></i>Quiz</h5>
                        {currentLecture.quizzes?.map((quiz, index) => (
                            <div key={index} className="quiz-question mb-4 p-4 border rounded">
                                <h6 className="fw-bold mb-3"><span className="badge bg-primary me-2">{index + 1}</span>{quiz.question}</h6>
                                <div>{quiz.options?.map((option, optIndex) => (
                                    <div key={optIndex} className="form-check mb-2">
                                        <input className="form-check-input" type="radio" name={`quiz-${index}`} id={`q-${index}-o-${optIndex}`} onChange={() => handleAnswerSelect(index, optIndex)} />
                                        <label className={`form-check-label ${selectedAnswers[index] !== undefined && (optIndex === quiz.correctAnswer ? 'text-success fw-bold' : (optIndex === selectedAnswers[index] ? 'text-danger' : ''))}`} htmlFor={`q-${index}-o-${optIndex}`}>
                                            {option}
                                        </label>
                                    </div>
                                ))}</div>
                                {selectedAnswers[index] !== undefined && (
                                    <div className={`explanation mt-3 p-3 rounded ${selectedAnswers[index] === quiz.correctAnswer ? 'bg-success-light' : 'bg-danger-light'}`}>
                                        <strong><i className="fas fa-lightbulb me-2"></i>Explanation:</strong>
                                        <p className="mb-0 mt-1">{quiz.explanation}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div></div>
                )}
                {currentTab === 'chat' && (
                    <div className="card tab-pane-card"><div className="card-body" style={{display: 'flex', flexDirection: 'column', height: '600px'}}>
                        <h5 className="mb-3"><i className="fas fa-comments me-2"></i>Q&A Chat</h5>
                        <div ref={chatBoxRef} className="chat-messages flex-grow-1 mb-3">
                            {chatMessages.length === 0 ? (
                                <div className="text-center text-muted h-100 d-flex flex-column justify-content-center">
                                    <i className="fas fa-robot fa-2x mb-2"></i>
                                    <p>Ask me anything about this lecture!</p>
                                </div>
                            ) : (
                                chatMessages.map((msg, index) => (
                                    <div key={index} className={`chat-bubble-wrapper ${msg.type === 'user' ? 'user' : 'bot'}`}>
                                        <div className="chat-bubble">{msg.content}</div>
                                    </div>
                                ))
                            )}
                            {isLoadingChat && <div className="chat-bubble-wrapper bot"><div className="chat-bubble"><i>Typing...</i></div></div>}
                        </div>
                        <div className="input-group">
                            <input type="text" className="form-control" placeholder="Ask a question..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} disabled={isLoadingChat} />
                            <button className="btn btn-primary" onClick={handleSendMessage} disabled={isLoadingChat || !newMessage.trim()}><i className="fas fa-paper-plane"></i></button>
                        </div>
                    </div></div>
                )}
            </div>
        );
    };

    export default App;