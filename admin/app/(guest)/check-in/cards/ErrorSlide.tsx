"use client";

export function ErrorSlide({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div className={`checkin-card__error-slide ${visible ? "checkin-card__error-slide--visible" : "checkin-card__error-slide--hidden"}`}>
      <div className="checkin-card__error">
        <span className="material-symbols-rounded checkin-card__error-icon">report</span>
        <span>{message}</span>
      </div>
    </div>
  );
}
