// server.js - Final Working Version
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const { spawn } = require('child_process');
const { remark } = require('remark');
const html = require('remark-html').default;
const PptxGenJS = require('pptxgenjs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/studytree', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// OpenRouter API Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// AI API call function
const callAI = async (messages, maxTokens = 1500) => {
    if (!OPENROUTER_API_KEY) throw new Error('OpenRouter API key is not configured in .env file.');
    try {
        const response = await axios.post(`${OPENROUTER_BASE_URL}/chat/completions`, {
            model: OPENROUTER_MODEL,
            messages: messages,
            max_tokens: maxTokens,
            temperature: 0.7
        }, {
            headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` }
        });
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('AI API Error:', error.response?.data || error.message);
        throw new Error('Failed to communicate with the AI model.');
    }
};

// Schema
const lectureSchema = new mongoose.Schema({
    title: { type: String, required: true },
    videoPath: String,
    youtubeUrl: String,
    duration: Number,
    transcriptMd: String,
    transcriptHtml: String,
    summaryMd: String,
    summaryHtml: String,
    slides: [{ timestamp: Number, image: String }],
    quizzes: [{ question: String, options: [String], correctAnswer: Number, explanation: String }],
    uploadDate: { type: Date, default: Date.now },
    processingError: String,
    source: { type: String, enum: ['file', 'youtube'], default: 'file' },
    processingStage: { type: String, default: 'uploaded' }
});
const Lecture = mongoose.model('Lecture', lectureSchema);

// Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });


// ==================== CORE PROCESSING UTILS ====================

// NEW: Robust YouTube download using yt-dlp
const downloadYouTubeVideo = (url, lectureId) => new Promise((resolve, reject) => {
    const videoPath = `uploads/${lectureId}-youtube.mp4`;
    console.log(`📺 Downloading YouTube video with yt-dlp: ${url}`);

    const ytdlp = spawn('yt-dlp', [
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4/best',
        '-o', videoPath,
        url
    ]);

    ytdlp.stdout.on('data', (data) => console.log(`yt-dlp: ${data}`));
    ytdlp.stderr.on('data', (data) => console.error(`yt-dlp stderr: ${data}`));

    ytdlp.on('close', (code) => {
        if (code === 0) {
            console.log('✅ YouTube video downloaded successfully.');
            resolve(videoPath);
        } else {
            reject(new Error(`yt-dlp failed with code ${code}. Make sure it is installed and in your system's PATH.`));
        }
    });

    ytdlp.on('error', (err) => reject(new Error(`Failed to start yt-dlp. Is it installed? Error: ${err.message}`)));
});


const transcribeWithWhisper = (audioPath) => new Promise((resolve, reject) => {
    console.log(`🎙️  Transcribing with Whisper: ${audioPath}`);
    const whisper = spawn('whisper', [audioPath, '--model', 'base', '--output_format', 'txt', '--output_dir', path.dirname(audioPath), '--language', 'en']);
    let errorOutput = '';
    whisper.stderr.on('data', (data) => { errorOutput += data.toString(); console.log('Whisper info:', data.toString().trim()); });
    whisper.on('close', (code) => {
        if (code === 0) {
            const txtPath = audioPath.replace(path.extname(audioPath), '.txt');
            if (fs.existsSync(txtPath)) {
                const transcript = fs.readFileSync(txtPath, 'utf8');
                fs.unlinkSync(txtPath);
                resolve(transcript.trim());
            } else { reject(new Error('Whisper finished, but output file not found.')); }
        } else { reject(new Error(`Whisper failed: ${errorOutput}`)); }
    });
    whisper.on('error', (err) => reject(new Error(`Failed to start Whisper: ${err.message}`)));
});

// Formatting Transcript
const formatTranscript = (rawTranscript) => {
    console.log('✍️  Formatting transcript with AI...');
    return callAI([{ role: "user", content: `Format this raw transcript by adding paragraph breaks for readability. Do not change any words:\n\n${rawTranscript}` }], 2500);
};
// const formatTranscript = (rawTranscript) => {
//     console.log('✍️  Formatting transcript with AI...');
//     const messages = [{
//         role: "user",
//         // MODIFIED PROMPT:
//         content: `Format the following raw transcript by adding paragraph breaks for better readability. Return ONLY the formatted transcript text, with no introductory phrases or extra text.\n\n${rawTranscript}`
//     }];
//     return callAI(messages, 2500);
// };


// Formatting Transcript
// const generateSummary = (transcript) => {
//     console.log('📝 Generating summary with AI...');
//     const messages = [{
//         role: "user",
//         // MODIFIED PROMPT:
//         content: `Create a comprehensive summary of the following transcript. Use headings and bullet points for clear organization. Return ONLY the summary, with no introductory phrases like "Here is the summary...".\n\n${transcript}`
//     }];
//     return callAI(messages);
// };
const generateSummary = (transcript) => {
    console.log('📝 Generating summary with AI...');
    return callAI([{ role: "user", content: `Create a comprehensive summary of this transcript. Use headings and bullet points:\n\n${transcript}` }]);
};


// RESTORED: Intelligent Quiz Generation (with self-correcting retry loop)
const generateQuizzes = async (transcript) => {
    console.log('❓ Generating intelligent quiz with AI...');
    let lastResponse = '';

    // Try up to 2 times to get valid JSON
    for (let i = 0; i < 2; i++) {
        try {
            const messages = [{
                role: "user",
                content: i === 0
                    ? `Based on this transcript, create 5 multiple choice questions with 4 options each. Return ONLY a valid JSON array in this exact format, with no other text or explanation: [{"question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": 1, "explanation": "..."}]\n\nTranscript: ${transcript}`
                    : `The following text is not valid JSON. Please fix any syntax errors (like unescaped quotes or trailing commas) and return ONLY the corrected, valid JSON array, with no other text:\n\n${lastResponse}`
            }];

            const response = await callAI(messages);
            lastResponse = response; // Save for potential retry

            // Extract the JSON part more reliably
            const startIndex = response.indexOf('[');
            const endIndex = response.lastIndexOf(']');
            if (startIndex === -1 || endIndex === -1) {
                throw new Error("AI response did not contain a JSON array.");
            }
            const jsonString = response.substring(startIndex, endIndex + 1);

            // Attempt to parse the cleaned JSON
            let quizzes = JSON.parse(jsonString);

            // If parsing succeeds, randomize and return
            quizzes.forEach(quiz => {
                if (quiz.options && quiz.correctAnswer !== undefined) {
                    const correctAnswerText = quiz.options[quiz.correctAnswer];
                    quiz.options.sort(() => Math.random() - 0.5); // Simple shuffle
                    quiz.correctAnswer = quiz.options.indexOf(correctAnswerText);
                }
            });
            console.log('✅ AI generated valid JSON for quizzes.');
            return quizzes;

        } catch (e) {
            console.warn(`Attempt ${i + 1} failed: Could not parse quiz JSON. Retrying...`);
            if (i === 1) { // Last attempt failed
                console.error("Failed to parse quiz JSON after multiple attempts:", e);
                throw new Error(`The AI failed to generate a valid quiz after multiple attempts. Last response: ${lastResponse}`);
            }
        }
    }
};
// const generateQuizzes = async (transcript) => {
//     console.log('❓ Generating quiz with AI...');
//     const response = await callAI([{ role: "user", content: `Based on this transcript, create 5 multiple choice questions. Return ONLY a valid JSON array: [{"question": "...", "options": ["A", "B", "Correct C", "D"], "correctAnswer": 2, "explanation": "..."}]\n\nTranscript: ${transcript}` }]);
//     try {
//         const quizzes = JSON.parse(response.replace(/```json\n?|\n?```/g, '').trim());
//         quizzes.forEach(q => { // Randomize answers
//             const correctText = q.options[q.correctAnswer];
//             q.options.sort(() => Math.random() - 0.5);
//             q.correctAnswer = q.options.indexOf(correctText);
//         });
//         return quizzes;
//     } catch (e) { console.error("Failed to parse quiz JSON:", e); return []; }
// };

const extractAudio = (videoPath) => new Promise((resolve, reject) => {
    const audioPath = videoPath.replace(path.extname(videoPath), '.wav');
    ffmpeg(videoPath).output(audioPath).audioCodec('pcm_s16le').audioFrequency(16000).audioChannels(1)
        .on('end', () => resolve(audioPath))
        .on('error', (err) => reject(err))
        .run();
});

const extractFrames = (videoPath, lectureId) => new Promise((resolve, reject) => {
    const framesDir = `uploads/frames_${lectureId}`;
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        const duration = metadata.format.duration;
        const frameCount = Math.min(12, Math.max(4, Math.floor(duration / 30)));
        ffmpeg(videoPath).screenshots({ count: frameCount, folder: framesDir, filename: 'slide_%03d.png', size: '1280x720' })
            .on('end', () => {
                const frames = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).sort()
                    .map((f, i) => ({ timestamp: Math.floor((i + 1) * (duration / frameCount)), image: `/frames_${lectureId}/${f}`}));
                resolve(frames);
            })
            .on('error', (err) => reject(err));
    });
});


// ==================== MAIN PROCESSING FLOW ====================

const processLecture = async (lectureId, videoPath, title) => {
    try {
        await Lecture.findByIdAndUpdate(lectureId, { processingStage: 'extracting_audio' });
        const audioPath = await extractAudio(videoPath);

        await Lecture.findByIdAndUpdate(lectureId, { processingStage: 'transcribing' });
        const rawTranscript = await transcribeWithWhisper(audioPath);
        const transcript = await formatTranscript(rawTranscript);
        const transcriptHtml = String(await remark().use(html).process(transcript));

        await Lecture.findByIdAndUpdate(lectureId, { processingStage: 'summarizing', transcriptMd: transcript, transcriptHtml });
        const summary = await generateSummary(transcript);
        const summaryHtml = String(await remark().use(html).process(summary));

        const quizzes = await generateQuizzes(transcript);
        const slides = await extractFrames(videoPath, lectureId);

        await Lecture.findByIdAndUpdate(lectureId, {
            summaryMd: summary, summaryHtml,
            quizzes, slides,
            processingStage: 'complete',
            processingError: null
        });
        console.log(`🎉 Processing Complete for lecture ${lectureId}!`);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch (error) {
        console.error(`❌ PROCESSING ERROR for lecture ${lectureId}:`, error.message);
        await Lecture.findByIdAndUpdate(lectureId, { processingError: error.message, processingStage: 'failed' });
    }
};

const processYouTubeLecture = async (lectureId, youtubeUrl, title) => {
    try {
        await Lecture.findByIdAndUpdate(lectureId, { processingStage: 'downloading' });
        const videoPath = await downloadYouTubeVideo(youtubeUrl, lectureId);
        await Lecture.findByIdAndUpdate(lectureId, { videoPath });
        await processLecture(lectureId, videoPath, title);
    } catch (error) {
        console.error(`❌ YOUTUBE PROCESSING ERROR:`, error.message);
        await Lecture.findByIdAndUpdate(lectureId, { processingError: error.message, processingStage: 'failed' });
    }
};

// ==================== ROUTES ====================

app.post('/api/upload', upload.single('video'), async (req, res) => {
    const lecture = new Lecture({ title: req.body.title || req.file.originalname, videoPath: req.file.path, source: 'file' });
    await lecture.save();
    processLecture(lecture._id, lecture.videoPath, lecture.title);
    res.json({ message: 'Processing started!', lectureId: lecture._id });
});

app.post('/api/upload-youtube', async (req, res) => {
    const { title, youtubeUrl } = req.body;
    const lecture = new Lecture({ title, youtubeUrl, source: 'youtube' });
    await lecture.save();
    processYouTubeLecture(lecture._id, youtubeUrl, title);
    res.json({ message: 'Processing started!', lectureId: lecture._id });
});

app.get('/api/lectures', async (req, res) => res.json(await Lecture.find().sort({ uploadDate: -1 })));
app.get('/api/lectures/:id', async (req, res) => res.json(await Lecture.findById(req.params.id)));

app.get('/api/status/:lectureId', async (req, res) => {
    const lecture = await Lecture.findById(req.params.lectureId);
    if (!lecture) return res.status(404).json({ error: 'Lecture not found' });
    res.json({
        isComplete: lecture.processingStage === 'complete',
        stage: lecture.processingStage, error: lecture.processingError,
        hasTranscript: !!lecture.transcriptMd, hasSummary: !!lecture.summaryMd,
        hasQuizzes: !!lecture.quizzes?.length, hasSlides: !!lecture.slides?.length,
    });
});

// CORRECTED: PPT Download route
app.get('/api/lectures/:id/download-ppt', async (req, res) => {
    try {
        const lecture = await Lecture.findById(req.params.id);
        if (!lecture || !lecture.slides?.length) return res.status(404).json({ error: 'No slides found.' });

        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE';
        const titleSlide = pptx.addSlide();
        titleSlide.addText(lecture.title, { x: 0.5, y: 2.5, w: '90%', h: 1.5, align: 'center', fontSize: 44, bold: true });

        for (const slide of lecture.slides) {
            const correctImageName = slide.image.startsWith('/') ? slide.image.substring(1) : slide.image;
            const imagePath = path.join(__dirname, 'uploads', correctImageName);
            if (fs.existsSync(imagePath)) {
                pptx.addSlide().addImage({ path: imagePath, x: '5%', y: '10%', w: '90%', h: '80%' });
            } else {
                console.warn(`PPT Warning: Image not found at ${imagePath}`);
            }
        }

        const buffer = await pptx.write('buffer');
        const fileName = `${lecture.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_slides.pptx`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate presentation: ' + error.message });
    }
});

app.post('/api/chat/:lectureId', async (req, res) => {
    try {
        const { question } = req.body;
        const lecture = await Lecture.findById(req.params.lectureId);
        if (!lecture || !lecture.transcriptMd) return res.status(404).json({ error: 'Transcript not found' });
        const messages = [
            { role: "system", content: "You are a helpful teaching assistant. Answer questions based ONLY on the provided lecture transcript." },
            { role: "user", content: `Transcript:\n"${lecture.transcriptMd}"\n\nQuestion:\n${question}` }
        ];
        const answer = await callAI(messages, 800);
        res.json({ answer });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get response from chatbot' });
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🌳 Study Tree Server running on port ${PORT}`);
    console.log(`   Mode: AI-Powered Content Generation`);
    console.log(`   Transcription: Local Whisper (FREE)`);
    console.log(`   Content Engine: OpenRouter API (Requires .env setup)`);
});

module.exports = app;