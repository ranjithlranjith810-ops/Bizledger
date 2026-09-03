"use client";

import React, {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";
import {
  exportCroppedSignature,
  isCanvasEmpty,
} from "@/lib/signatureCanvas";

interface SignatureCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 220;
const INK_STYLE = "#191c1e";
const INK_WIDTH = 2.6;

export const SignatureCanvasModal: React.FC<SignatureCanvasModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const displayRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build the offscreen buffer and seed the display once the modal opens.
  useLayoutEffect(() => {
    if (!isOpen) return;
    undoStackRef.current = [];

    if (!bufferRef.current) {
      bufferRef.current = document.createElement("canvas");
    }
    const buffer = bufferRef.current;
    buffer.width = CANVAS_WIDTH;
    buffer.height = CANVAS_HEIGHT;
    const bctx = buffer.getContext("2d");
    if (bctx) bctx.clearRect(0, 0, buffer.width, buffer.height);

    const display = displayRef.current;
    if (display) {
      display.width = CANVAS_WIDTH;
      display.height = CANVAS_HEIGHT;
      const dctx = display.getContext("2d");
      if (dctx) dctx.clearRect(0, 0, display.width, display.height);
    }
  }, [isOpen]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = displayRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(CANVAS_WIDTH, ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH)
    );
    const y = Math.max(
      0,
      Math.min(CANVAS_HEIGHT, ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT)
    );
    return { x, y };
  };

  const redrawFromBuffer = useCallback(() => {
    const display = displayRef.current;
    const buffer = bufferRef.current;
    if (!display || !buffer) return;
    const dctx = display.getContext("2d");
    if (!dctx) return;
    dctx.clearRect(0, 0, display.width, display.height);
    dctx.drawImage(buffer, 0, 0);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
    const canvas = e.currentTarget;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture unsupported */
    }
    // Snapshot this stroke for undo BEFORE drawing begins.
    const buffer = bufferRef.current;
    const bctx = buffer?.getContext("2d");
    if (buffer && bctx) {
      undoStackRef.current.push(
        bctx.getImageData(0, 0, buffer.width, buffer.height)
      );
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const point = getPoint(e);
    const buffer = bufferRef.current;
    const last = lastPointRef.current;
    if (!point || !buffer || !last) return;
    const bctx = buffer.getContext("2d");
    if (!bctx) return;

    const offset = INK_WIDTH / 2;
    bctx.lineWidth = INK_WIDTH;
    bctx.lineCap = "round";
    bctx.lineJoin = "round";
    bctx.strokeStyle = INK_STYLE;
    bctx.beginPath();
    bctx.moveTo(Math.max(last.x, offset), Math.max(last.y, offset));
    bctx.lineTo(Math.max(point.x, offset), Math.max(point.y, offset));
    bctx.stroke();
    // Dot for a tap (no movement).
    if (last.x === point.x && last.y === point.y) {
      bctx.beginPath();
      bctx.arc(last.x, last.y, INK_WIDTH / 2, 0, Math.PI * 2);
      bctx.fillStyle = INK_STYLE;
      bctx.fill();
    }
    lastPointRef.current = point;
    redrawFromBuffer();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = e.currentTarget;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current) handlePointerUp(e);
  };

  const handleClear = () => {
    const buffer = bufferRef.current;
    const display = displayRef.current;
    if (buffer) buffer.getContext("2d")?.clearRect(0, 0, buffer.width, buffer.height);
    if (display) {
      const dctx = display.getContext("2d");
      if (dctx) dctx.clearRect(0, 0, display.width, display.height);
    }
    undoStackRef.current = [];
    setError(null);
  };

  const handleUndo = () => {
    const buffer = bufferRef.current;
    const bctx = buffer?.getContext("2d");
    if (!buffer || !bctx) return;
    const snapshot = undoStackRef.current.pop();
    if (snapshot) {
      bctx.putImageData(snapshot, 0, 0);
    } else {
      bctx.clearRect(0, 0, buffer.width, buffer.height);
    }
    redrawFromBuffer();
    setError(null);
  };

  const handleSave = () => {
    const display = displayRef.current;
    if (!display) return;
    const dctx = display.getContext("2d");
    if (!dctx) {
      setError("Unable to read the signature canvas.");
      return;
    }
    const imageData = dctx.getImageData(0, 0, display.width, display.height);
    if (isCanvasEmpty(imageData.data, display.width, display.height)) {
      setError("Please draw your signature before saving.");
      return;
    }
    const dataUrl = exportCroppedSignature(display, { padding: 14, scale: 2 });
    if (!dataUrl) {
      setError("Please draw your signature before saving.");
      return;
    }
    onSave(dataUrl);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Draw Your Signature"
      subtitle="Sign with your mouse, trackpad, or finger."
      maxWidth="xl"
      footer={
        <div className="w-full flex flex-col-reverse sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 mr-auto">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleUndo}
              className="px-3 py-2 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
            >
              Undo
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-[#93000b] hover:bg-[#770008] text-white text-xs font-bold shadow-xs transition-colors"
            >
              Save Signature
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div
          className="w-full rounded-xl border-2 border-dashed border-outline-variant bg-white overflow-hidden"
          style={{ touchAction: "none" }}
        >
          <canvas
            ref={displayRef}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              touchAction: "none",
              cursor: "crosshair",
              background:
                "repeating-linear-gradient(0deg,#ffffff,#ffffff 46px,#f4f6f8 46px,#f4f6f8 47px), repeating-linear-gradient(90deg,#ffffff,#ffffff 46px,#f4f6f8 46px,#f4f6f8 47px)",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerUp}
            aria-label="Signature drawing area"
          />
        </div>
        <p className="text-[11px] text-outline">
          Draw your signature above. Anything you draw is kept private to this
          business and used only on your invoices.
        </p>
        {error && (
          <div
            role="alert"
            className="text-xs font-semibold text-[#93000b] bg-[#fef2f2] border border-[#fecaca] rounded-lg px-3 py-2"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
};