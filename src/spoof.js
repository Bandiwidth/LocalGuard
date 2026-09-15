(function() {
  // 1. Hardware Spoofing (Keep static per page load to avoid breaking app logic)
  const fakeCores = [2, 4, 8, 12, 16][Math.floor(Math.random() * 5)];
  const fakeMemory = [2, 4, 8, 16][Math.floor(Math.random() * 4)];

  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fakeCores });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => fakeMemory });
  } catch (e) {}

  // 2. Canvas Spoofing (Randomize per call to trigger "randomized" detection)
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const width = this.width;
      const height = this.height;
      if (width > 0 && height > 0) {
        const noise = Math.random();
        ctx.fillStyle = `rgba(${Math.floor(noise*255)}, ${Math.floor(noise*255)}, ${Math.floor(noise*255)}, 0.01)`;
        ctx.fillRect(0, 0, 1, 1);
      }
    }
    return origToDataURL.apply(this, args);
  };

  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    const imageData = origGetImageData.apply(this, args);
    if (imageData.data && imageData.data.length >= 4) {
      const shift = (Math.random() * 4) - 2;
      imageData.data[0] = Math.min(255, Math.max(0, imageData.data[0] + shift));
      imageData.data[1] = Math.min(255, Math.max(0, imageData.data[1] + shift));
      imageData.data[2] = Math.min(255, Math.max(0, imageData.data[2] + shift));
    }
    return imageData;
  };

  // 3. WebGL Spoofing
  if (window.WebGLRenderingContext) {
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(pname) {
      const result = origGetParameter.apply(this, [pname]);
      if (pname === 37445) return 'Google Inc. (Spoofed)'; 
      if (pname === 37446) return 'ANGLE (Spoofed Graphics, OpenGL 4.1)';
      return result;
    };
    const origBufferData = WebGLRenderingContext.prototype.bufferData;
    WebGLRenderingContext.prototype.bufferData = function(target, data, usage) {
      if (data && data.length > 0 && typeof data[0] === 'number') {
        data[0] += (Math.random() * 0.001) - 0.0005;
      }
      origBufferData.apply(this, arguments);
    };
    const origClearColor = WebGLRenderingContext.prototype.clearColor;
    WebGLRenderingContext.prototype.clearColor = function(r, g, b, a) {
      origClearColor.call(this, r + (Math.random()*0.0001), g + (Math.random()*0.0001), b + (Math.random()*0.0001), a);
    };
    const origReadPixels = WebGLRenderingContext.prototype.readPixels;
    WebGLRenderingContext.prototype.readPixels = function(...args) {
      origReadPixels.apply(this, args);
      if (args[6] && args[6].length > 0) {
        args[6][0] = Math.min(255, Math.max(0, args[6][0] + (Math.floor(Math.random() * 4) - 2)));
      }
    };
  }
  if (window.WebGL2RenderingContext) {
    const origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(pname) {
      const result = origGetParameter2.apply(this, [pname]);
      if (pname === 37445) return 'Google Inc. (Spoofed)';
      if (pname === 37446) return 'ANGLE (Spoofed Graphics, OpenGL 4.1)';
      return result;
    };
    const origBufferData2 = WebGL2RenderingContext.prototype.bufferData;
    WebGL2RenderingContext.prototype.bufferData = function(target, data, usage) {
      if (data && data.length > 0 && typeof data[0] === 'number') {
        data[0] += (Math.random() * 0.001) - 0.0005;
      }
      origBufferData2.apply(this, arguments);
    };
    const origClearColor2 = WebGL2RenderingContext.prototype.clearColor;
    WebGL2RenderingContext.prototype.clearColor = function(r, g, b, a) {
      origClearColor2.call(this, r + (Math.random()*0.0001), g + (Math.random()*0.0001), b + (Math.random()*0.0001), a);
    };
    const origReadPixels2 = WebGL2RenderingContext.prototype.readPixels;
    WebGL2RenderingContext.prototype.readPixels = function(...args) {
      origReadPixels2.apply(this, args);
      if (args[6] && args[6].length > 0) {
        args[6][0] = Math.min(255, Math.max(0, args[6][0] + (Math.floor(Math.random() * 4) - 2)));
      }
    };
  }

  // 4. Audio Spoofing (Randomize per call)
  if (window.OfflineAudioContext) {
    const origCreateDynamicsCompressor = window.OfflineAudioContext.prototype.createDynamicsCompressor;
    window.OfflineAudioContext.prototype.createDynamicsCompressor = function() {
      const comp = origCreateDynamicsCompressor.apply(this, arguments);
      if (comp.threshold && comp.threshold.value !== undefined) {
        comp.threshold.value += (Math.random() * 0.01) - 0.005;
      }
      return comp;
    };
    
    const origStartRendering = window.OfflineAudioContext.prototype.startRendering;
    window.OfflineAudioContext.prototype.startRendering = function() {
      return origStartRendering.apply(this, arguments).then(buffer => {
        if (buffer && buffer.getChannelData) {
          const data = buffer.getChannelData(0);
          if (data && data.length > 0) {
            data[0] += (Math.random() * 0.0002) - 0.0001; // Tiny noise
          }
        }
        return buffer;
      });
    };
  }

  if (window.AudioBuffer) {
    const origGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function(channel) {
      const data = origGetChannelData.apply(this, [channel]);
      if (data && data.length > 0) {
        data[0] += ((Math.random() * 4) - 2) * 0.0001;
      }
      return data;
    };
  }

  if (window.AnalyserNode) {
    const origGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
    AnalyserNode.prototype.getFloatFrequencyData = function(array) {
      origGetFloatFrequencyData.apply(this, [array]);
      if (array && array.length > 0) {
        const shift = (Math.random() * 4) - 2;
        array[0] += (shift * 0.1);
      }
    };
  }

  // 5. Font & DOM Spoofing (Randomize per call)
  const origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  if (origOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      get: function() {
        const val = origOffsetWidth.get.call(this);
        return val ? val + Math.floor(Math.random() * 3) - 1 : val; 
      }
    });
  }

  const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  if (origOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      get: function() {
        const val = origOffsetHeight.get.call(this);
        return val ? val + Math.floor(Math.random() * 3) - 1 : val;
      }
    });
  }

  const origGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function() {
    const rect = origGetBoundingClientRect.call(this);
    if (rect.width && rect.height) {
      return new DOMRect(
        rect.x,
        rect.y,
        rect.width + (Math.random() * 0.1) - 0.05,
        rect.height + (Math.random() * 0.1) - 0.05
      );
    }
    return rect;
  };

})();
