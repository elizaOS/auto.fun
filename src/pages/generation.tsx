{audioUrl && (
  <div className="mt-4">
    <audio controls className="w-full">
      <source src={audioUrl} type="audio/wav" />
      Your browser does not support the audio element.
    </audio>
    <a 
      href={audioUrl} 
      download="generated_audio.wav"
      className="mt-2 inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
    >
      Download Audio
    </a>
  </div>
)} 