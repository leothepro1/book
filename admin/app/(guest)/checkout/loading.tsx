import "@/app/_components/Loading/loading.css";

export default function CheckoutLoading() {
  return (
    <div className="loading-screen loading-screen--fixed">
      <div className="loading-screen__content">
        {/* @ts-expect-error — dotlottie-wc web component */}
        <dotlottie-wc src="/animations/loading.lottie" speed="1.6" style={{ width: 56, height: 56, filter: "brightness(0.3)" }} loop autoplay />
      </div>
    </div>
  );
}
