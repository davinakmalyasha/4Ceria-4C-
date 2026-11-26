import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { PwaStatus } from '@/components/pwa/PwaStatus';

const pwa = vi.hoisted(() => ({
  values: {
    canInstall: false,
    installed: false,
    needsIosInstructions: false,
    updateReady: false,
  },
  install: vi.fn<() => Promise<'accepted' | 'dismissed' | 'unavailable'>>(),
  applyUpdate: vi.fn(),
}));

vi.mock('@/components/pwa/PwaProvider', () => ({
  usePwa: () => ({ ...pwa.values, install: pwa.install, applyUpdate: pwa.applyUpdate }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  pwa.values = {
    canInstall: false,
    installed: false,
    needsIosInstructions: false,
    updateReady: false,
  };
  pwa.install.mockReset().mockResolvedValue('dismissed');
  pwa.applyUpdate.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function ready() {
  act(() => {
    vi.advanceTimersByTime(3500);
  });
}

describe('PwaStatus', () => {
  test('shows the update banner and applies on Refresh', () => {
    pwa.values.updateReady = true;
    render(<PwaStatus />);
    expect(screen.getByText('A new version of 4Ceria is ready.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(pwa.applyUpdate).toHaveBeenCalledTimes(1);
  });

  test('renders null when installed', () => {
    pwa.values.installed = true;
    pwa.values.canInstall = true;
    const { container } = render(<PwaStatus />);
    ready();
    expect(container.textContent).toBe('');
  });

  test('renders null when dismissal was remembered', () => {
    window.localStorage.setItem('4ceria.pwa.install.dismissed', '1');
    pwa.values.canInstall = true;
    const { container } = render(<PwaStatus />);
    ready();
    expect(container.textContent).toBe('');
  });

  test('waits for the ready delay before offering installation', () => {
    pwa.values.canInstall = true;
    const { container } = render(<PwaStatus />);
    expect(container.textContent).toBe('');
    ready();
    expect(screen.getByText('Install 4Ceria')).toBeDefined();
  });

  test('renders null when nothing is installable', () => {
    const { container } = render(<PwaStatus />);
    ready();
    expect(container.textContent).toBe('');
  });

  test('accepted install dismisses and remembers', async () => {
    pwa.values.canInstall = true;
    pwa.install.mockResolvedValue('accepted');
    render(<PwaStatus />);
    ready();
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
    expect(screen.getByText('Opening…')).toBeDefined();
    await act(async () => {});
    expect(pwa.install).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('4ceria.pwa.install.dismissed')).toBe('1');
    expect(screen.queryByText('Install 4Ceria')).toBeNull();
  });

  test('a dismissed prompt leaves the card up', async () => {
    pwa.values.canInstall = true;
    pwa.install.mockResolvedValue('dismissed');
    render(<PwaStatus />);
    ready();
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
    await act(async () => {});
    expect(screen.getByText('Install 4Ceria')).toBeDefined();
    expect(window.localStorage.getItem('4ceria.pwa.install.dismissed')).toBeNull();
  });

  test('an unavailable prompt dismisses the card', async () => {
    pwa.values.canInstall = true;
    pwa.install.mockResolvedValue('unavailable');
    render(<PwaStatus />);
    ready();
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
    await act(async () => {});
    expect(screen.queryByText('Install 4Ceria')).toBeNull();
  });

  test('iOS shows help instead of calling install', () => {
    pwa.values.needsIosInstructions = true;
    render(<PwaStatus />);
    ready();
    fireEvent.click(screen.getByRole('button', { name: 'How to install' }));
    expect(screen.getByText(/Tap the Share button/)).toBeDefined();
    expect(pwa.install).not.toHaveBeenCalled();
  });

  test('dismiss buttons remember the choice', () => {
    pwa.values.canInstall = true;
    const first = render(<PwaStatus />);
    ready();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install prompt' }));
    expect(screen.queryByText('Install 4Ceria')).toBeNull();
    expect(window.localStorage.getItem('4ceria.pwa.install.dismissed')).toBe('1');

    window.localStorage.clear();
    first.unmount();
    render(<PwaStatus />);
    ready();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Install 4Ceria')).toBeNull();
    expect(window.localStorage.getItem('4ceria.pwa.install.dismissed')).toBe('1');
  });

  test('a blocked storage still shows the card and dismisses quietly', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    pwa.values.canInstall = true;
    render(<PwaStatus />);
    ready();
    expect(screen.getByText('Install 4Ceria')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install prompt' }));
    expect(screen.queryByText('Install 4Ceria')).toBeNull();
  });
});
