/**
 * Tests for monitoring and diagnostics system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MonitoringService from '../src/services/MonitoringService.js';
import DiagnosticTools from '../src/services/DiagnosticTools.js';
import PerformanceMonitor from '../src/services/PerformanceMonitor.js';

// Mock socket manager
const mockSocketManager = {
    io: {
        sockets: {
            sockets: new Map()
        },
        on: vi.fn(),
        emit: vi.fn(),
        to: vi.fn(() => ({
            emit: vi.fn()
        }))
    },
    gameRooms: new Map(),
    userSockets: new Map(),
    socketUsers: new Map()
};

// Mock connection status manager
const mockConnectionStatusManager = {
    getConnectionHealth: vi.fn(),
    getPublicStats: vi.fn(() => ({
        activeConnections: 0,
        healthyConnections: 0
    })),
    getDetailedStats: vi.fn(() => ({
        activeConnections: 0,
        totalConnections: 0,
        reconnections: 0
    }))
};

// Mock periodic reconciliation service
const mockPeriodicReconciliationService = {
    getDetailedStats: vi.fn(() => ({
        totalReconciliations: 0,
        successfulReconciliations: 0,
        failedReconciliations: 0,
        inconsistenciesFound: 0,
        successRate: 100,
        inconsistencyRate: 0,
        activeRooms: 0
    }))
};

describe('MonitoringService', () => {
    let monitoringService;

    beforeEach(() => {
        monitoringService = new MonitoringService(
            mockSocketManager,
            mockConnectionStatusManager,
            mockPeriodicReconciliationService
        );
    });

    afterEach(() => {
        if (monitoringService.isRunning) {
            monitoringService.stop();
        }
    });

    it('should initialize with default configuration', () => {
        expect(monitoringService.isRunning).toBe(false);
        expect(monitoringService.config.metricsRetentionPeriod).toBe(24 * 60 * 60 * 1000);
        expect(monitoringService.metrics).toBeDefined();
        expect(monitoringService.diagnostics).toBeDefined();
    });

    it('should start and stop monitoring', () => {
        expect(monitoringService.isRunning).toBe(false);
        
        monitoringService.start();
        expect(monitoringService.isRunning).toBe(true);
        
        monitoringService.stop();
        expect(monitoringService.isRunning).toBe(false);
    });

    it('should record connection events', () => {
        const connectionEvent = {
            type: 'connection',
            socketId: 'socket123',
            userId: 'user123',
            username: 'testuser',
            timestamp: Date.now()
        };

        monitoringService.recordConnectionEvent(connectionEvent);
        
        expect(monitoringService.metrics.websocketHealth.connectionEvents).toHaveLength(1);
        expect(monitoringService.metrics.websocketHealth.connectionEvents[0]).toEqual(connectionEvent);
    });

    it('should record latency measurements', () => {
        monitoringService.recordLatencyMeasurement('socket123', 150);
        
        expect(monitoringService.metrics.websocketHealth.latencyMeasurements).toHaveLength(1);
        expect(monitoringService.metrics.websocketHealth.latencyMeasurements[0].latency).toBe(150);
        expect(monitoringService.metrics.websocketHealth.latencyMeasurements[0].socketId).toBe('socket123');
    });

    it('should generate dashboard data', () => {
        const dashboardData = monitoringService.getDashboardData();
        
        expect(dashboardData).toBeDefined();
        expect(dashboardData.overview).toBeDefined();
        expect(dashboardData.websocketHealth).toBeDefined();
        expect(dashboardData.stateSynchronization).toBeDefined();
        expect(dashboardData.lobbyPerformance).toBeDefined();
        expect(dashboardData.alerts).toBeDefined();
    });

    it('should reset metrics', () => {
        // Add some test data
        monitoringService.recordConnectionEvent({
            type: 'connection',
            socketId: 'socket123',
            timestamp: Date.now()
        });
        
        expect(monitoringService.metrics.websocketHealth.connectionEvents).toHaveLength(1);
        
        monitoringService.resetMetrics();
        
        expect(monitoringService.metrics.websocketHealth.connectionEvents).toHaveLength(0);
    });
});

describe('DiagnosticTools', () => {
    let diagnosticTools;

    beforeEach(() => {
        const monitoringService = new MonitoringService(
            mockSocketManager,
            mockConnectionStatusManager,
            mockPeriodicReconciliationService
        );
        
        diagnosticTools = new DiagnosticTools(
            mockSocketManager,
            mockConnectionStatusManager,
            monitoringService
        );
    });

    it('should initialize with default configuration', () => {
        expect(diagnosticTools.config.maxDiagnosticHistory).toBe(50);
        expect(diagnosticTools.diagnosticHistory).toBeDefined();
        expect(diagnosticTools.diagnosticCounter).toBe(0);
    });

    it('should generate unique diagnostic IDs', () => {
        const id1 = diagnosticTools.generateDiagnosticId();
        const id2 = diagnosticTools.generateDiagnosticId();
        
        expect(id1).not.toBe(id2);
        expect(id1).toMatch(/^diag_\d+_\d+$/);
        expect(id2).toMatch(/^diag_\d+_\d+$/);
    });

    it('should store and retrieve diagnostic results', () => {
        const diagnosticId = 'test_diagnostic_123';
        const diagnostic = {
            id: diagnosticId,
            status: 'completed',
            tests: {}
        };
        
        diagnosticTools.storeDiagnosticResult(diagnosticId, diagnostic);
        
        const retrieved = diagnosticTools.getDiagnosticResult(diagnosticId);
        expect(retrieved).toEqual(diagnostic);
    });

    it('should generate diagnostic summary', () => {
        const tests = {
            test1: { status: 'passed' },
            test2: { status: 'failed', severity: 'high' },
            test3: { status: 'warning', severity: 'medium' }
        };
        
        const summary = diagnosticTools.generateDiagnosticSummary(tests);
        
        expect(summary.totalTests).toBe(3);
        expect(summary.passed).toBe(1);
        expect(summary.failed).toBe(1);
        expect(summary.warnings).toBe(1);
        expect(summary.highIssues).toHaveLength(1);
        expect(summary.mediumIssues).toHaveLength(1);
    });

    it('should clear diagnostic history', () => {
        diagnosticTools.storeDiagnosticResult('test1', { id: 'test1' });
        diagnosticTools.storeDiagnosticResult('test2', { id: 'test2' });
        
        expect(diagnosticTools.diagnosticHistory.size).toBe(2);
        
        diagnosticTools.clearDiagnosticHistory();
        
        expect(diagnosticTools.diagnosticHistory.size).toBe(0);
    });
});

describe('PerformanceMonitor', () => {
    let performanceMonitor;

    beforeEach(() => {
        performanceMonitor = new PerformanceMonitor(mockSocketManager);
    });

    afterEach(() => {
        if (performanceMonitor.isMonitoring) {
            performanceMonitor.stop();
        }
    });

    it('should initialize with default configuration', () => {
        expect(performanceMonitor.isMonitoring).toBe(false);
        expect(performanceMonitor.config.latencyThresholds).toBeDefined();
        expect(performanceMonitor.metrics).toBeDefined();
        expect(performanceMonitor.profiles).toBeDefined();
    });

    it('should start and stop monitoring', () => {
        expect(performanceMonitor.isMonitoring).toBe(false);
        
        performanceMonitor.start();
        expect(performanceMonitor.isMonitoring).toBe(true);
        
        performanceMonitor.stop();
        expect(performanceMonitor.isMonitoring).toBe(false);
    });

    it('should categorize latency correctly', () => {
        expect(performanceMonitor.categorizeLatency(25)).toBe('excellent');
        expect(performanceMonitor.categorizeLatency(75)).toBe('good');
        expect(performanceMonitor.categorizeLatency(200)).toBe('acceptable');
        expect(performanceMonitor.categorizeLatency(400)).toBe('poor');
        expect(performanceMonitor.categorizeLatency(1500)).toBe('critical');
    });

    it('should start and end operations', () => {
        const operationId = performanceMonitor.startOperation('test_operation', { gameId: 'room123' });
        
        expect(operationId).toMatch(/^test_operation_\d+_\d+$/);
        expect(performanceMonitor.activeOperations.has(operationId)).toBe(true);
        
        const result = performanceMonitor.endOperation(operationId, true, { success: true });
        
        expect(result.operationId).toBe(operationId);
        expect(result.success).toBe(true);
        expect(performanceMonitor.activeOperations.has(operationId)).toBe(false);
    });

    it('should record latency measurements', () => {
        performanceMonitor.recordLatencyMeasurement('test_operation', 150);
        
        expect(performanceMonitor.metrics.latencyMeasurements).toHaveLength(1);
        expect(performanceMonitor.metrics.latencyMeasurements[0].latency).toBe(150);
        expect(performanceMonitor.metrics.latencyMeasurements[0].operation).toBe('test_operation');
    });

    it('should calculate statistics correctly', () => {
        const values = [100, 200, 300, 400, 500];
        
        expect(performanceMonitor.calculateAverage(values)).toBe(300);
        expect(performanceMonitor.calculatePercentile(values, 50)).toBe(300);
        expect(performanceMonitor.calculatePercentile(values, 95)).toBe(500);
    });

    it('should generate performance summary', () => {
        // Add some test data
        performanceMonitor.recordLatencyMeasurement('test_op', 100);
        performanceMonitor.recordLatencyMeasurement('test_op', 200);
        
        const summary = performanceMonitor.getPerformanceSummary();
        
        expect(summary).toBeDefined();
        expect(summary.overview).toBeDefined();
        expect(summary.latency).toBeDefined();
        expect(summary.broadcast).toBeDefined();
        expect(summary.operations).toBeDefined();
        expect(summary.system).toBeDefined();
        expect(summary.alerts).toBeDefined();
    });

    it('should reset metrics', () => {
        performanceMonitor.recordLatencyMeasurement('test_op', 100);
        expect(performanceMonitor.metrics.latencyMeasurements).toHaveLength(1);
        
        performanceMonitor.resetMetrics();
        expect(performanceMonitor.metrics.latencyMeasurements).toHaveLength(0);
    });
});

describe('Integration Tests', () => {
    let monitoringService;
    let diagnosticTools;
    let performanceMonitor;

    beforeEach(() => {
        monitoringService = new MonitoringService(
            mockSocketManager,
            mockConnectionStatusManager,
            mockPeriodicReconciliationService
        );
        
        diagnosticTools = new DiagnosticTools(
            mockSocketManager,
            mockConnectionStatusManager,
            monitoringService
        );
        
        performanceMonitor = new PerformanceMonitor(mockSocketManager);
    });

    afterEach(() => {
        if (monitoringService.isRunning) monitoringService.stop();
        if (performanceMonitor.isMonitoring) performanceMonitor.stop();
    });

    it('should work together to provide comprehensive monitoring', () => {
        // Start all services
        monitoringService.start();
        performanceMonitor.start();
        
        expect(monitoringService.isRunning).toBe(true);
        expect(performanceMonitor.isMonitoring).toBe(true);
        
        // Record some test data
        monitoringService.recordConnectionEvent({
            type: 'connection',
            socketId: 'socket123',
            userId: 'user123',
            timestamp: Date.now()
        });
        
        performanceMonitor.recordLatencyMeasurement('room_join', 150);
        
        // Get dashboard data
        const dashboardData = monitoringService.getDashboardData();
        const performanceSummary = performanceMonitor.getPerformanceSummary();
        
        expect(dashboardData).toBeDefined();
        expect(performanceSummary).toBeDefined();
        
        // Verify data is being collected
        expect(monitoringService.metrics.websocketHealth.connectionEvents).toHaveLength(1);
        expect(performanceMonitor.metrics.latencyMeasurements).toHaveLength(1);
    });
});