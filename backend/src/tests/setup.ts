/**
 * Jest Test Setup
 */

beforeAll(async () => {
  // Setup test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test_user:test_password@localhost:5432/test_db';
});

afterAll(async () => {
  // Cleanup
});
