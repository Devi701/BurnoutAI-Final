import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SettingsPage from './SettingsPage';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

describe('SettingsPage Integrations', () => {
  // Mock window.location for redirect testing
  const originalLocation = window.location;

  beforeEach(() => {
    delete window.location;
    window.location = {
      href: '',
      origin: 'http://localhost:3000',
      assign: vi.fn(),
    };
  });

  afterEach(() => {
    window.location = originalLocation;
    cleanup();
  });

  it('renders all 4 required integration options', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/slack/i)).toBeInTheDocument();
    expect(screen.getByText(/trello/i)).toBeInTheDocument();
    expect(screen.getByText(/jira/i)).toBeInTheDocument();
    expect(screen.getByText(/asana/i)).toBeInTheDocument();
  });

  it('toggles Jira switch to Connected when URL has success param', () => {
    render(
      <MemoryRouter initialEntries={['/settings?integration_success=jira']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify Jira is connected
    // We check that we have 3 "Connect" buttons (Slack, Trello, Asana) and 1 "Connected" badge (Jira)
    
    const connectButtons = screen.getAllByRole('button', { name: 'Connect' });
    expect(connectButtons).toHaveLength(3); 

    const connectedBadges = screen.getAllByText('Connected');
    expect(connectedBadges).toHaveLength(1);
  });

  it('initiates OAuth redirect when Connect button is clicked', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    // Find the connect button for Slack specifically.
    // Slack is the first key in our state object, so it renders first.
    const buttons = screen.getAllByRole('button', { name: 'Connect' });
    fireEvent.click(buttons[0]); 

    expect(window.location.href).toContain('slack.com/oauth');
    expect(window.location.href).toContain('client_id=MOCK_SLACK_CLIENT_ID');
  });
});