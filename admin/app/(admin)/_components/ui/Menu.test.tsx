// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Menu } from './Menu';

afterEach(() => {
  cleanup();
});

describe('Menu — open/closed', () => {
  it('renders the trigger and not the menu by default', () => {
    render(
      <Menu trigger={<button type="button">Open</button>}>
        <Menu.Item onSelect={() => {}}>One</Menu.Item>
      </Menu>,
    );
    expect(screen.getByRole('button', { name: 'Open' })).not.toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens the menu on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Menu trigger={<button type="button">Open</button>}>
        <Menu.Item onSelect={() => {}}>One</Menu.Item>
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).not.toBeNull();
  });

  it('toggles the menu on second trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Menu trigger={<button type="button">Open</button>}>
        <Menu.Item onSelect={() => {}}>One</Menu.Item>
      </Menu>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    expect(screen.getByRole('menu')).not.toBeNull();
    await user.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('sets aria-haspopup and aria-expanded on the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Menu trigger={<button type="button">Open</button>}>
        <Menu.Item onSelect={() => {}}>One</Menu.Item>
      </Menu>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Menu — close behaviour', () => {
  it('closes when ESC is pressed', async () => {
    const user = userEvent.setup();
    render(
      <Menu trigger={<button type="button">Open</button>}>
        <Menu.Item onSelect={() => {}}>One</Menu.Item>
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when an item is selected', async () => {
    const user = userEvent.setup();
    render(
      <Menu trigger={<button type="button">Open</button>}>
        <Menu.Item onSelect={() => {}}>Edit</Menu.Item>
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('calls onSelect when an item is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Menu trigger={<button type="button">Open</button>}>
        <Menu.Item onSelect={onSelect}>Edit</Menu.Item>
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('Menu — items', () => {
  it('emits ui-menu__item--danger for tone="danger"', async () => {
    const user = userEvent.setup();
    render(
      <Menu trigger={<button type="button">Open</button>}>
        <Menu.Item tone="danger" onSelect={() => {}}>Delete</Menu.Item>
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(
      screen.getByRole('menuitem', { name: 'Delete' }).className,
    ).toContain('ui-menu__item--danger');
  });

  it('does not call onSelect for disabled item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Menu trigger={<button type="button">Open</button>}>
        <Menu.Item disabled onSelect={onSelect}>Edit</Menu.Item>
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders a divider as role=separator', async () => {
    const user = userEvent.setup();
    render(
      <Menu trigger={<button type="button">Open</button>}>
        <Menu.Item onSelect={() => {}}>One</Menu.Item>
        <Menu.Divider />
        <Menu.Item onSelect={() => {}}>Two</Menu.Item>
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('separator')).not.toBeNull();
  });
});

describe('Menu — controlled', () => {
  it('respects the open prop and calls onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    function Wrapper() {
      return (
        <Menu
          trigger={<button type="button">Open</button>}
          open
          onOpenChange={onOpenChange}
        >
          <Menu.Item onSelect={() => {}}>One</Menu.Item>
        </Menu>
      );
    }

    render(<Wrapper />);
    expect(screen.getByRole('menu')).not.toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'One' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Menu — subcomponent guard', () => {
  it('throws when Menu.Item is used outside Menu', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<Menu.Item onSelect={() => {}}>Out</Menu.Item>),
    ).toThrow(/inside <Menu>/);
    spy.mockRestore();
  });
});
