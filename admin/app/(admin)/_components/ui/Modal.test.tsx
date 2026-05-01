// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Modal } from './Modal';

afterEach(() => {
  cleanup();
  // Body scroll lock is set on document.body — reset between tests.
  document.body.style.overflow = '';
});

describe('Modal — open/closed', () => {
  it('renders nothing when open=false', () => {
    render(
      <Modal open={false} onClose={() => {}}>
        <Modal.Body>Hidden</Modal.Body>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a dialog when open=true', () => {
    render(
      <Modal open onClose={() => {}}>
        <Modal.Header>Title</Modal.Header>
        <Modal.Body>Visible</Modal.Body>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(screen.getByText('Visible')).not.toBeNull();
  });
});

describe('Modal — variants', () => {
  it('emits ui-modal--default by default', () => {
    render(
      <Modal open onClose={() => {}}>
        <Modal.Body>X</Modal.Body>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).toContain('ui-modal--default');
  });

  it('emits the correct variant class for each option', () => {
    const variants: Array<'default' | 'sticky' | 'single-button'> = [
      'default',
      'sticky',
      'single-button',
    ];
    for (const v of variants) {
      const { unmount } = render(
        <Modal open onClose={() => {}} variant={v}>
          <Modal.Body>X</Modal.Body>
        </Modal>,
      );
      expect(screen.getByRole('dialog').className).toContain(`ui-modal--${v}`);
      unmount();
    }
  });
});

describe('Modal — a11y', () => {
  it('sets role=dialog and aria-modal=true', () => {
    render(
      <Modal open onClose={() => {}}>
        <Modal.Body>X</Modal.Body>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('links aria-labelledby to the Header title', () => {
    render(
      <Modal open onClose={() => {}}>
        <Modal.Header>My title</Modal.Header>
        <Modal.Body>X</Modal.Body>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toBe('My title');
  });

  it('links aria-describedby to the Body', () => {
    render(
      <Modal open onClose={() => {}}>
        <Modal.Body>The description</Modal.Body>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const descId = dialog.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId!)?.textContent).toBe('The description');
  });
});

describe('Modal — dismiss behaviour', () => {
  it('calls onClose when ESC is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <Modal.Body>X</Modal.Body>
      </Modal>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on ESC when dismissible=false', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} dismissible={false}>
        <Modal.Body>X</Modal.Body>
      </Modal>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Modal — body scroll lock', () => {
  it('locks document.body overflow while open', () => {
    const { unmount } = render(
      <Modal open onClose={() => {}}>
        <Modal.Body>X</Modal.Body>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('Modal — subcomponent guard', () => {
  it('throws when subcomponents are used outside <Modal>', () => {
    // Suppress React's error logging for this expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Modal.Body>X</Modal.Body>)).toThrow(/inside <Modal>/);
    spy.mockRestore();
  });
});
