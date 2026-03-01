export default function Loading() {
  return (
    <div className="sektion73-modal">
      <header className="sektion73-modal__header">
        {/* back button placeholder */}
        <div
          className="g-skeleton"
          aria-hidden="true"
          style={{ width: 35, height: 35, borderRadius: 999 }}
        />
        {/* title placeholder */}
        <div
          className="g-skeleton"
          aria-hidden="true"
          style={{ height: 14, width: 110, borderRadius: 999 }}
        />
      </header>

      <div className="sektion73-modal__body">
        <div className="sektion73-steps" style={{ transform: "translateX(0%)" }}>
          <section className="sektion73-step" style={{ pointerEvents: "none" }}>
            <div className="sektion73-card__header">
              <div style={{ width: "100%" }}>
                <div
                  className="g-skeleton"
                  aria-hidden="true"
                  style={{ height: 32, width: "55%", margin: "0 auto", borderRadius: 999 }}
                />
                <div
                  className="g-skeleton"
                  aria-hidden="true"
                  style={{ height: 14, width: "72%", margin: "10px auto 0", borderRadius: 999 }}
                />
              </div>
            </div>

            <div className="sektion73-choicegrid">
              {/* Choice 1 */}
              <button
                type="button"
                className="sektion73-choicebtn"
                disabled
                style={{ position: "relative", overflow: "hidden" }}
              >
                <div className="sektion73-choicebtn__title" style={{ opacity: 0 }}>
                  Bokningsnummer
                </div>

                <span
                  className="g-skeleton"
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "inherit",
                    pointerEvents: "none",
                  }}
                />
              </button>

              {/* Choice 2 */}
              <button
                type="button"
                className="sektion73-choicebtn"
                disabled
                style={{ position: "relative", overflow: "hidden" }}
              >
                <div className="sektion73-choicebtn__title" style={{ opacity: 0 }}>
                  E-post
                </div>

                <span
                  className="g-skeleton"
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "inherit",
                    pointerEvents: "none",
                  }}
                />
              </button>

              {/* Divider (behåll samma layout; skeletona texten) */}
              <div className="sektion73-divider" aria-hidden="true">
                <span className="sektion73-divider__line" />
                <span
                  className="g-skeleton"
                  style={{ height: 12, width: 44, borderRadius: 999, display: "inline-block" }}
                />
                <span className="sektion73-divider__line" />
              </div>

              {/* Choice 3 */}
              <button
                type="button"
                className="sektion73-choicebtn"
                disabled
                style={{ position: "relative", overflow: "hidden" }}
              >
                <div className="sektion73-choicebtn__title" style={{ opacity: 0 }}>
                  Namn + datum
                </div>

                <span
                  className="g-skeleton"
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "inherit",
                    pointerEvents: "none",
                  }}
                />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}