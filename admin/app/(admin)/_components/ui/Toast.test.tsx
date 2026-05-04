// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastProvider, useToast } from './Toast';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

function Trigger({ run }: { run: (api: ReturnType<typeof useToast>) => void }) {
  const api = useToast();
  return (
    <button type="button" onClick={() => run(api)}>
      run
    </button>
  );
}

describe('Toast — provider mount', () => {
  it('renders children without any toasts initially', () => {
    render(
      <ToastProvider>
        <div>child</div>
      </ToastProvider>,
    );
    expect(screen.getByText('child')).not.toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('Toast — useToast guard', () => {
  it('throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function BadConsumer() {
      useToast();
      return null;
    }
    expect(() => render(<BadConsumer />)).toThrow(/inside <ToastProvider>/);
    spy.mockRestore();
  });
});

describe('Toast — show + render', () => {
  it('renders a toast in the live region after show()', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger run={(api) => api.show('Sparat')} />
      </ToastProvider>,
    );
    await user.click(screen.getByText('run'));
    expect(screen.getByText('Sparat')).not.toBeNull();
    expect(screen.getByRole('region')).not.toBeNull();
  });

  it('always renders a close button on every toast', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger run={(api) => api.show('hi')} />
      </ToastProvider>,
    );
    await user.click(screen.getByText('run'));
    expect(screen.getByRole('button', { name: 'Stäng notis' })).not.toBeNull();
  });
});

describe('Toast — variants', () => {
  it('emits ui-toast--success with the success helper', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger run={(api) => api.success('OK')} />
      </ToastProvider>,
    );
    await user.click(screen.getByText('run'));
    // Toasts are portaled to document.body — query the document.
    expect(document.querySelector('.ui-toast--success')).not.toBeNull();
  });

  it('emits ui-toast--error with the error helper', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger run={(api) => api.error('Fel')} />
      </ToastProvider>,
    );
    await user.click(screen.getByText('run'));
    expect(document.querySelector('.ui-toast--error')).not.toBeNull();
  });
});

describe('Toast — dismiss', () => {
  it('dismisses on close-button click (after exit animation)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger run={(api) => api.show('go')} />
      </ToastProvider>,
    );
    await user.click(screen.getByText('run'));
    expect(screen.getByText('go')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Stäng notis' }));
    // Exit animation runs for ~220ms; advance past it
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.queryByText('go')).toBeNull();
  });

  it('auto-dismisses after the duration', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger run={(api) => api.show('quick', { duration: 500 })} />
      </ToastProvider>,
    );
    await user.click(screen.getByText('run'));
    expect(screen.getByText('quick')).not.toBeNull();

    // Auto-dismiss timer + exit animation
    act(() => {
      vi.advanceTimersByTime(500 + 250);
    });
    expect(screen.queryByText('quick')).toBeNull();
  });
});

describe('Toast — stacking', () => {
  it('renders multiple toasts at once', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger
          run={(api) => {
            api.show('first');
            api.show('second');
            api.show('third');
          }}
        />
      </ToastProvider>,
    );
    await user.click(screen.getByText('run'));
    expect(screen.getByText('first')).not.toBeNull();
    expect(screen.getByText('second')).not.toBeNull();
    expect(screen.getByText('third')).not.toBeNull();
  });
});
