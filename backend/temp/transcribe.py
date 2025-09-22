
import speech_recognition as sr
import sys
import json

def transcribe_audio(audio_file):
    r = sr.Recognizer()
    
    try:
        with sr.AudioFile(audio_file) as source:
            print("Loading audio file...")
            audio = r.record(source)
            
        print("Transcribing with Google Speech Recognition (free tier)...")
        text = r.recognize_google(audio, language='en-US')
        return text
        
    except sr.UnknownValueError:
        return "Could not understand audio"
    except sr.RequestError as e:
        return f"Error with speech recognition service: {e}"
    except Exception as e:
        return f"Error processing audio: {e}"

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python transcribe.py <audio_file>")
        sys.exit(1)
    
    audio_file = sys.argv[1]
    result = transcribe_audio(audio_file)
    print(json.dumps({"transcript": result}))
