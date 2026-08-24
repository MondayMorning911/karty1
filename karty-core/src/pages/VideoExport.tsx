// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Camera, Download } from 'lucide-react';
import { CreateTab } from './MiniApp';

export function VideoExport() {

  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Mock states for CreateTab
  const [desc, setDesc] = useState("Уютная студия с панорамным видом. Адрес: ул. Анатолия Качарава, 5. Площадь 31,25 м². 12 этаж, дом газифицирован. Полностью меблирована и укомплектована техникой, теплый пол. Цена: $42,000.");
  const [selectedStyle, setSelectedStyle] = useState<any>('original');
  const [photos, setPhotos] = useState<string[]>(['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=300&q=80', 'https://images.unsplash.com/photo-1502672260266-1c1c24240f38?auto=format&fit=crop&w=300&q=80']);
  const [parsedData, setParsedData] = useState<any>({
    address: 'ул. Анатолия Качарава 5',
    area: 31.25,
    price: 42000,
    rooms: 1,
    floor: 12,
    missing_fields: []
  });
  const [addressCoords, setAddressCoords] = useState<{lat: number, lng: number} | null>({ lat: 41.6168, lng: 41.6366 });

  const startAnimation = () => {
    if (!cursorRef.current || !rippleRef.current || !glowRef.current || !containerRef.current) return;

    // Find the publish button inside CreateTab
    const buttons = Array.from(containerRef.current.querySelectorAll('button'));
    const publishBtn = buttons.find(b => b.textContent?.includes('Опубликовать'));
    if (!publishBtn) {
      console.warn('Publish button not found');
      return;
    }

    // Reset states
    gsap.set(cursorRef.current, { x: window.innerWidth / 2, y: window.innerHeight - 50, opacity: 1, scale: 1 });
    gsap.set(rippleRef.current, { scale: 0, opacity: 0 });
    gsap.set(glowRef.current, { opacity: 0 });
    gsap.set(publishBtn, { scale: 1 });

    const btnRect = publishBtn.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    const targetX = btnRect.left - containerRect.left + btnRect.width / 2;
    const targetY = btnRect.top - containerRect.top + btnRect.height / 2;

    gsap.set(rippleRef.current, {
      x: targetX - 8, // Center of 16x16 ripple
      y: targetY - 8
    });

    const tl = gsap.timeline();

    tl.to(cursorRef.current, {
      x: targetX,
      y: targetY,
      duration: 1.5,
      ease: "power2.inOut",
    })
    .to(cursorRef.current, {
      scale: 0.8,
      duration: 0.1,
    })
    .to(publishBtn, {
      scale: 0.95,
      duration: 0.1,
    }, "<")
    .to(cursorRef.current, {
      scale: 1,
      duration: 0.1,
    })
    .to(publishBtn, {
      scale: 1,
      duration: 0.1,
      onStart: () => {
         publishBtn.innerHTML = publishBtn.innerHTML.replace('Опубликовать', 'Публикация...');
      }
    }, "<")
    .to(rippleRef.current, {
      scale: 30, // Big circle covering the button area
      opacity: 0.8,
      duration: 0.8,
      ease: "power2.out",
    }, "<")
    .to(glowRef.current, {
      opacity: 0.6,
      duration: 0.8,
      ease: "power2.out",
    }, "<")
    .to(rippleRef.current, {
      opacity: 0,
      duration: 0.5,
    })
    .to(glowRef.current, {
      opacity: 0,
      duration: 1.5,
    })
    .to(cursorRef.current, {
      x: targetX + 100,
      y: targetY + 100,
      opacity: 0,
      duration: 1,
      ease: "power2.inOut"
    }, "-=1");
  };

  const startRecording = async () => {
    try {
      if (!containerRef.current) return;
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
      });

      let mimeType = 'video/webm';
      let ext = 'webm';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
        ext = 'mp4';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      setTimeout(() => {
        startAnimation();
      }, 500);

    } catch (err) {
      console.error("Error starting recording:", err);
      alert("Could not start screen recording. Please allow screen sharing.");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      startAnimation();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      {/* Controls */}
      <div className="absolute top-4 left-4 z-50 flex gap-4">
        <button 
          onClick={startAnimation}
          className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors font-medium text-sm flex items-center gap-2"
        >
          Replay Animation
        </button>
        <button 
          onClick={startRecording}
          disabled={isRecording}
          className={`px-4 py-2 ${isRecording ? 'bg-red-500/50' : 'bg-red-500 hover:bg-red-600'} text-white rounded-lg transition-colors font-medium text-sm flex items-center gap-2`}
        >
          <Camera size={16} />
          {isRecording ? "Recording..." : "Record (Screen Share)"}
        </button>
        {downloadUrl && (
          <a 
            href={downloadUrl} 
            download={`karty-animation.mp4`} // Browsers might save as webm if encoding was webm, but let's try
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors font-medium text-sm flex items-center gap-2"
          >
            <Download size={16} />
            Download Video
          </a>
        )}
      </div>

        {/* Main UI Container to Record */}
      <div 
        ref={containerRef}
        className="dark relative w-[375px] h-[812px] rounded-[40px] border-[8px] border-[#1A1A1A] overflow-hidden shadow-2xl flex flex-col bg-[#0A0A0A] text-white"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 100px rgba(83, 58, 253, 0.1)'
        }}
      >
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[40%] bg-[#533afd]/15 blur-[80px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#533afd]/10 blur-[100px] rounded-full pointer-events-none" />

        {/* Glow effect container for animation */}
        <div 
          ref={glowRef}
          className="absolute inset-0 z-[60] bg-gradient-to-t from-[#15be53] via-transparent to-transparent opacity-0 mix-blend-screen pointer-events-none"
          style={{ filter: 'blur(40px)' }}
        />

        <div className="flex-1 overflow-hidden relative z-10 w-full h-full bg-[#0A0A0A] pointer-events-none">
          <CreateTab 
            uid="user123" 
            navigateToPlatforms={() => {}} 
            descState={[desc, setDesc]} 
            styleState={[selectedStyle, setSelectedStyle]} 
            photosState={[photos, setPhotos]} 
            parsedDataState={[parsedData, setParsedData]} 
            addressCoordsState={[addressCoords, setAddressCoords]} 
          />
        </div>

        {/* Global Ripple element injected over UI */}
        <div 
           ref={rippleRef}
           className="absolute z-[100] w-4 h-4 bg-white/40 rounded-full pointer-events-none origin-center"
        />

        {/* Virtual Cursor */}
        <div 
          ref={cursorRef} 
          className="absolute z-50 pointer-events-none"
          style={{ 
            width: '24px', 
            height: '24px', 
            left: 0,
            top: 0,
            backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="%23FFFFFF" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 2l12 11.2-5.8.5 3.3 7.3-2.2 1-3.2-7.4-4.4 4.5z"/></svg>')`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.5))'
          }}
        />
      </div>
    </div>
  );
}
