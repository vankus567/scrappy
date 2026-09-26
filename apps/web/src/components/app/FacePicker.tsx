"use client";

import { useEffect, useRef, useState } from "react";
import { Pet, type Species } from "@/components/Pet";
import { usePet } from "@/lib/pet-store";

const OUT = 320; // saved face size in px (square JPEG, a few dozen KB)
const VIEW = 240; // crop circle on screen

/**
 * Put your real pet's face on your Scrappy. Pick or take a photo, drag and zoom it into the circle,
 * save. The photo is cropped on the phone and stays on the phone.
 */
export function FacePicker() {
  const { pet, update } = usePet();
  const input = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [error, setError] = useState("");

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That isn't a photo.");
      return;
    }
    setError("");
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      setZoom(1);
      setPos({ x: 0, y: 0 });
    };
    i.onerror = () => setError("Couldn't open that photo. Try another one.");
    i.src = url;
  };
  useEffect(() => () => {
    if (img) URL.revokeObjectURL(img.src);
  }, [img]);

  // the photo covers the circle at zoom 1; zoom scales from there
  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : 0;
  const h = img ? img.naturalHeight * scale : 0;
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.max(Math.min(p.x, (w - VIEW) / 2), -(w - VIEW) / 2),
    y: Math.max(Math.min(p.y, (h - VIEW) / 2), -(h - VIEW) / 2),
  });
  const at = clamp(pos);

  const save = () => {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d")!;
    const k = OUT / VIEW;
    ctx.drawImage(img, ((VIEW - w) / 2 + at.x) * k, ((VIEW - h) / 2 + at.y) * k, w * k, h * k);
    const face = canvas.toDataURL("image/jpeg", 0.85);
    update({ face });
    setImg(null);
  };

  const species = pet?.species as Species | undefined;

  if (!img) {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-[20px] bg-field p-4">
        <Pet species={species} face={pet?.face} mood="happy" dance="none" className="h-20 w-20" title={pet?.name ?? "Your pet"} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{pet?.face ? "Your real pet is fighting" : "Put your real pet's face on your Scrappy"}</p>
          <p className="text-[14px] text-ink-soft">The photo stays on this phone.</p>
          <div className="mt-2 flex gap-4">
            <button type="button" onClick={() => input.current?.click()} className="text-[15px] font-semibold text-[#007aff]">
              {pet?.face ? "Change photo" : "Add a photo"}
            </button>
            {pet?.face && (
              <button type="button" onClick={() => update({ face: undefined })} className="text-[15px] font-semibold text-ink-soft hover:text-ink">
                Remove
              </button>
            )}
          </div>
          {error && <p role="alert" className="mt-1 text-[14px] text-[#c2410c]">{error}</p>}
        </div>
        <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <div className="rounded-[20px] bg-field p-4">
      <p className="text-center font-semibold">Drag and zoom so the face fills the circle</p>
      <div
        className="relative mx-auto mt-3 cursor-grab touch-none overflow-hidden rounded-full active:cursor-grabbing"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: at.x, py: at.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.src}
          alt="Your pet photo"
          draggable={false}
          className="absolute max-w-none select-none"
          style={{ width: w, height: h, left: (VIEW - w) / 2 + at.x, top: (VIEW - h) / 2 + at.y }}
        />
      </div>
      <label className="mx-auto mt-4 flex max-w-[240px] items-center gap-3 text-[14px] text-ink-soft">
        Zoom
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-[#007aff]" />
      </label>
      <div className="mt-4 flex items-center justify-center gap-5">
        <button type="button" onClick={save} className="min-h-12 rounded-[14px] bg-[#007aff] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#0060cc]">
          Use this face
        </button>
        <button type="button" onClick={() => setImg(null)} className="text-[15px] font-semibold text-ink-soft hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
