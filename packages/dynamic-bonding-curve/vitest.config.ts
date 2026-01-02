import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        testTimeout: 30000,
    },
})
