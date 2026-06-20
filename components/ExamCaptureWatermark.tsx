"use client";

const TILE_COUNT = 18;

type Props = {
  label: string;
};

/** Semi-transparent repeating watermark to deter sharing leaked screenshots. */
export function ExamCaptureWatermark({ label }: Props) {
  return (
    <div className="tp-exam-watermark" aria-hidden="true">
      <div className="tp-exam-watermark__grid">
        {Array.from({ length: TILE_COUNT }, (_, index) => (
          <span key={index} className="tp-exam-watermark__tile">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
