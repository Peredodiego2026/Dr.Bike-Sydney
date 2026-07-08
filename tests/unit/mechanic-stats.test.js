// tests/unit/mechanic-stats.test.js — regression tests for mechanic rating/review
// aggregation, shared between handlePublicTrack and handlePublicMechanics in api/auth.js.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { aggregateMechanicStats, shortClientName } from '../../api/auth.js';

describe('shortClientName', () => {
  it('truncates a full name to first name + last initial', () => {
    expect(shortClientName('Sarah Miller')).toBe('Sarah M.');
  });

  it('keeps a single-word name as-is', () => {
    expect(shortClientName('Solo')).toBe('Solo');
  });

  it('falls back to a generic label for empty/missing names', () => {
    expect(shortClientName('')).toBe('Dr. Bike client');
    expect(shortClientName(null)).toBe('Dr. Bike client');
    expect(shortClientName(undefined)).toBe('Dr. Bike client');
  });
});

describe('aggregateMechanicStats', () => {
  it('counts all completed jobs, including unrated ones', () => {
    const jobs = [
      { client_rating: 5, client_review: null, client_name: 'A' },
      { client_rating: null, client_review: null, client_name: 'B' },
    ];
    expect(aggregateMechanicStats(jobs).jobs_completed).toBe(2);
  });

  it('averages only rated jobs, rounded to 1 decimal', () => {
    const jobs = [
      { client_rating: 5, client_review: null, client_name: 'A' },
      { client_rating: 4, client_review: null, client_name: 'B' },
      { client_rating: null, client_review: null, client_name: 'C' },
    ];
    expect(aggregateMechanicStats(jobs).rating).toBe(4.5);
  });

  it('returns null rating when no job has been rated', () => {
    const jobs = [{ client_rating: null, client_review: null, client_name: 'A' }];
    expect(aggregateMechanicStats(jobs).rating).toBeNull();
  });

  it('only includes jobs with a written comment in reviews, with privacy-safe names', () => {
    const jobs = [
      { client_rating: 5, client_review: 'Great job!', client_name: 'Sarah Miller' },
      { client_rating: 4, client_review: null, client_name: 'James Taylor' },
    ];
    const { reviews } = aggregateMechanicStats(jobs);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toEqual({ rating: 5, comment: 'Great job!', client_name: 'Sarah M.' });
  });

  it('caps the reviews list at maxReviews', () => {
    const jobs = Array.from({ length: 20 }, (_, i) => ({
      client_rating: 5,
      client_review: `Review ${i}`,
      client_name: `Client ${i}`,
    }));
    expect(aggregateMechanicStats(jobs, { maxReviews: 8 }).reviews).toHaveLength(8);
    expect(aggregateMechanicStats(jobs, { maxReviews: 12 }).reviews).toHaveLength(12);
  });

  it('handles a mechanic with zero completed jobs', () => {
    const result = aggregateMechanicStats([]);
    expect(result).toEqual({ jobs_completed: 0, rating: null, reviews: [] });
  });
});
