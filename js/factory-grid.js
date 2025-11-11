(function () {
  'use strict';

  const internal = {
    canvas: null,
    ctx: null,
    overlay: null,
    overlayAutoCreated: false,
    redraw: null,
    pointerStart: null,
    pointerEnd: null,
    footprint: null,
    optionsState: {
      metersPerGridSquare: 1,
      pixelsPerMeter: 1,
      gridSquareSizePx: null,
    },
    onFootprintChange: null,
    handlers: {},
  };

  function initialize({
    canvas,
    overlay,
    state = {},
    redraw,
    onFootprintChange,
  } = {}) {
    if (!canvas) {
      throw new Error('FactoryGrid.initialize requires a canvas element.');
    }

    cleanup();

    internal.canvas = canvas;
    internal.ctx = canvas.getContext('2d');
    const hasOverlay = Boolean(overlay);
    internal.overlayAutoCreated = !hasOverlay;
    internal.overlay = hasOverlay ? overlay : createOverlay(canvas);
    internal.redraw = typeof redraw === 'function' ? redraw : null;
    internal.onFootprintChange = typeof onFootprintChange === 'function' ? onFootprintChange : null;

    internal.optionsState.metersPerGridSquare = typeof state.metersPerGridSquare === 'number' && !Number.isNaN(state.metersPerGridSquare) && state.metersPerGridSquare > 0
      ? state.metersPerGridSquare
      : 1;

    if (typeof state.pixelsPerMeter === 'number' && !Number.isNaN(state.pixelsPerMeter) && state.pixelsPerMeter > 0) {
      internal.optionsState.pixelsPerMeter = state.pixelsPerMeter;
    } else if (typeof state.metersPerPixel === 'number' && !Number.isNaN(state.metersPerPixel) && state.metersPerPixel > 0) {
      internal.optionsState.pixelsPerMeter = 1 / state.metersPerPixel;
    } else {
      internal.optionsState.pixelsPerMeter = 1;
    }

    if (typeof state.gridSquareSizePx === 'number' && !Number.isNaN(state.gridSquareSizePx) && state.gridSquareSizePx > 0) {
      internal.optionsState.gridSquareSizePx = state.gridSquareSizePx;
    } else {
      internal.optionsState.gridSquareSizePx = null;
    }

    ensureCanvasPointerSettings(canvas);
    attachListeners(canvas);
    render();
    updateOverlay();
  }

  function cleanup() {
    if (internal.canvas && internal.handlers.pointerdown) {
      internal.canvas.removeEventListener('pointerdown', internal.handlers.pointerdown);
      internal.canvas.removeEventListener('pointermove', internal.handlers.pointermove);
      internal.canvas.removeEventListener('pointerup', internal.handlers.pointerup);
      internal.canvas.removeEventListener('pointercancel', internal.handlers.pointercancel);
      internal.canvas.removeEventListener('pointerleave', internal.handlers.pointercancel);
    }

    if (internal.overlay && internal.overlayAutoCreated && internal.overlay.parentElement) {
      internal.overlay.parentElement.removeChild(internal.overlay);
      internal.overlay = null;
    }

    internal.handlers = {};
    internal.pointerStart = null;
    internal.pointerEnd = null;
    internal.footprint = null;
    internal.overlayAutoCreated = false;
    internal.overlay = null;
    internal.canvas = null;
    internal.ctx = null;
  }

  function ensureCanvasPointerSettings(canvas) {
    if (!canvas.style.touchAction || canvas.style.touchAction !== 'none') {
      canvas.style.touchAction = 'none';
    }
  }

  function createOverlay(canvas) {
    const overlay = document.createElement('div');
    overlay.className = 'factory-grid__overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0.75rem';
    overlay.style.left = '0.75rem';
    overlay.style.padding = '0.35rem 0.75rem';
    overlay.style.background = 'rgba(18, 18, 18, 0.78)';
    overlay.style.color = '#ffffff';
    overlay.style.fontFamily = '"Muli", "Helvetica Neue", Arial, sans-serif';
    overlay.style.fontSize = '0.85rem';
    overlay.style.fontWeight = '600';
    overlay.style.borderRadius = '4px';
    overlay.style.pointerEvents = 'none';
    overlay.style.userSelect = 'none';
    overlay.style.whiteSpace = 'nowrap';

    const parent = canvas.parentElement;
    if (parent) {
      const computed = window.getComputedStyle(parent);
      if (computed.position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(overlay);
    }

    return overlay;
  }

  function attachListeners(canvas) {
    internal.handlers.pointerdown = handlePointerDown;
    internal.handlers.pointermove = handlePointerMove;
    internal.handlers.pointerup = handlePointerUp;
    internal.handlers.pointercancel = handlePointerCancel;

    canvas.addEventListener('pointerdown', internal.handlers.pointerdown);
    canvas.addEventListener('pointermove', internal.handlers.pointermove);
    canvas.addEventListener('pointerup', internal.handlers.pointerup);
    canvas.addEventListener('pointercancel', internal.handlers.pointercancel);
    canvas.addEventListener('pointerleave', internal.handlers.pointercancel);
  }

  function handlePointerDown(event) {
    if (!internal.canvas) {
      return;
    }

    event.preventDefault();
    if (typeof internal.canvas.setPointerCapture === 'function') {
      try {
        internal.canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore capture errors triggered by rapid re-attachments.
      }
    }
    internal.pointerStart = quantizePoint(eventToCanvasPoint(event));
    internal.pointerEnd = { ...internal.pointerStart };
    internal.footprint = createFootprint(internal.pointerStart, internal.pointerEnd);
    render();
    updateOverlay();
    if (internal.onFootprintChange) {
      internal.onFootprintChange(internal.footprint);
    }
  }

  function handlePointerMove(event) {
    if (!internal.canvas || !internal.pointerStart) {
      return;
    }

    event.preventDefault();
    const nextPoint = quantizePoint(eventToCanvasPoint(event));
    if (!pointsEqual(nextPoint, internal.pointerEnd)) {
      internal.pointerEnd = nextPoint;
      internal.footprint = createFootprint(internal.pointerStart, internal.pointerEnd);
      render();
      updateOverlay();
      if (internal.onFootprintChange) {
        internal.onFootprintChange(internal.footprint);
      }
    }
  }

  function handlePointerUp(event) {
    if (!internal.canvas || !internal.pointerStart) {
      return;
    }

    internal.canvas.releasePointerCapture(event.pointerId);
    internal.pointerEnd = quantizePoint(eventToCanvasPoint(event));
    internal.footprint = createFootprint(internal.pointerStart, internal.pointerEnd);
    internal.pointerStart = null;
    render();
    updateOverlay();
    if (internal.onFootprintChange) {
      internal.onFootprintChange(internal.footprint);
    }
  }

  function handlePointerCancel(event) {
    if (internal.canvas && typeof internal.canvas.releasePointerCapture === 'function' && event?.pointerId !== undefined) {
      try {
        internal.canvas.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignore release errors caused by stale captures.
      }
    }

    if (!internal.pointerStart) {
      return;
    }

    const hadFootprint = Boolean(internal.footprint);

    internal.pointerStart = null;
    internal.pointerEnd = null;
    internal.footprint = null;
    render();
    updateOverlay();

    if (hadFootprint && internal.onFootprintChange) {
      internal.onFootprintChange(null);
    }
  }

  function eventToCanvasPoint(event) {
    const rect = internal.canvas.getBoundingClientRect();
    const scaleX = internal.canvas.width / rect.width;
    const scaleY = internal.canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function quantizePoint(point) {
    const gridSize = getGridSizePx();
    if (!gridSize) {
      return { ...point };
    }

    return {
      x: quantize(point.x, gridSize),
      y: quantize(point.y, gridSize),
    };
  }

  function quantize(value, gridSize) {
    if (!gridSize) {
      return value;
    }
    return Math.round(value / gridSize) * gridSize;
  }

  function getGridSizePx() {
    if (internal.optionsState.gridSquareSizePx) {
      return internal.optionsState.gridSquareSizePx;
    }

    const metersPerGridSquare = internal.optionsState.metersPerGridSquare || 0;
    const pixelsPerMeter = internal.optionsState.pixelsPerMeter || 0;

    if (!metersPerGridSquare || !pixelsPerMeter) {
      return 0;
    }

    return metersPerGridSquare * pixelsPerMeter;
  }

  function pointsEqual(a, b) {
    if (!a || !b) {
      return false;
    }
    return a.x === b.x && a.y === b.y;
  }

  function createFootprint(start, end) {
    const topLeftX = Math.min(start.x, end.x);
    const topLeftY = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    const gridSize = getGridSizePx();
    const metersPerGrid = internal.optionsState.metersPerGridSquare || 0;
    const pixelsPerMeter = internal.optionsState.pixelsPerMeter || 0;

    let widthMeters = 0;
    let heightMeters = 0;

    if (gridSize) {
      const widthSquares = width / gridSize;
      const heightSquares = height / gridSize;
      widthMeters = widthSquares * metersPerGrid;
      heightMeters = heightSquares * metersPerGrid;
    } else if (pixelsPerMeter) {
      widthMeters = width / pixelsPerMeter;
      heightMeters = height / pixelsPerMeter;
    } else if (metersPerGrid) {
      widthMeters = width * metersPerGrid;
      heightMeters = height * metersPerGrid;
    }

    return {
      start,
      end,
      x: topLeftX,
      y: topLeftY,
      width,
      height,
      widthMeters,
      heightMeters,
    };
  }

  function render() {
    if (!internal.canvas || !internal.ctx) {
      return;
    }

    if (internal.redraw) {
      internal.redraw(internal.ctx);
    } else {
      internal.ctx.clearRect(0, 0, internal.canvas.width, internal.canvas.height);
    }

    if (!internal.footprint || !internal.footprint.width || !internal.footprint.height) {
      return;
    }

    internal.ctx.save();
    internal.ctx.beginPath();
    internal.ctx.rect(internal.footprint.x, internal.footprint.y, internal.footprint.width, internal.footprint.height);
    internal.ctx.fillStyle = 'rgba(255, 99, 71, 0.25)';
    internal.ctx.strokeStyle = 'rgba(220, 20, 60, 0.95)';
    internal.ctx.lineWidth = 2;
    internal.ctx.fill();
    internal.ctx.stroke();
    internal.ctx.restore();
  }

  function updateOverlay() {
    if (!internal.overlay) {
      return;
    }

    if (!internal.footprint || !internal.footprint.width || !internal.footprint.height) {
      internal.overlay.textContent = 'Footprint: –';
      return;
    }

    const widthText = formatMeters(internal.footprint.widthMeters);
    const heightText = formatMeters(internal.footprint.heightMeters);
    internal.overlay.textContent = `Footprint: ${widthText} × ${heightText}`;
  }

  function formatMeters(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '0 m';
    }

    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    const displayValue = Number.isInteger(rounded) ? Math.round(rounded) : Number(rounded.toFixed(2));
    const normalized = Object.is(displayValue, -0) ? 0 : displayValue;
    return `${normalized} m`;
  }

  function getFootprint() {
    return internal.footprint ? { ...internal.footprint } : null;
  }

  function destroy() {
    cleanup();
    internal.canvas = null;
    internal.ctx = null;
    internal.overlay = null;
    internal.redraw = null;
    internal.onFootprintChange = null;
  }

  function autoInitialize() {
    const canvas = document.querySelector('[data-factory-grid]');
    if (!canvas) {
      return;
    }

    const overlay = document.querySelector('[data-factory-grid-overlay]');
    const metersPerGridSquare = Number(canvas.dataset.metersPerGridSquare);
    const pixelsPerMeter = Number(canvas.dataset.pixelsPerMeter);
    const metersPerPixel = Number(canvas.dataset.metersPerPixel);
    const gridSquareSizePx = Number(canvas.dataset.gridSquareSizePx);

    const state = {};
    if (!Number.isNaN(metersPerGridSquare) && metersPerGridSquare > 0) {
      state.metersPerGridSquare = metersPerGridSquare;
    }
    if (!Number.isNaN(pixelsPerMeter) && pixelsPerMeter > 0) {
      state.pixelsPerMeter = pixelsPerMeter;
    }
    if (!Number.isNaN(metersPerPixel) && metersPerPixel > 0) {
      state.metersPerPixel = metersPerPixel;
    }
    if (!Number.isNaN(gridSquareSizePx) && gridSquareSizePx > 0) {
      state.gridSquareSizePx = gridSquareSizePx;
    }

    initialize({ canvas, overlay, state });
  }

  window.FactoryGrid = {
    initialize,
    destroy,
    getFootprint,
    render,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInitialize, { once: true });
  } else {
    autoInitialize();
  }
})();
