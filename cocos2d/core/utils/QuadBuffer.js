//A quad buffer that manages a contiguous array of quads, makes sure they have the same buffer as memory backing, makes sure there's the correct size available for them, can manage uploading to webgl buffers, etc.
var QuadBuffer = (function () {

    function QuadBuffer()
    {
        this._quads = [];
        this._usedQuads = -1;
        this._quadMemory = null;
        this._quadU32View;
        this._glBuffer = gl.createBuffer();
        this._glBufferDirty = false;
    }

    var p = QuadBuffer.prototype;
    
    p.getU32Memory = function()
    {
        return this._quadU32View;
    }

    //makes sure there's enough room for the given number of quads
    p.allocateForSize = function(numQuads)
    {
        if (this._usedQuads < numQuads)
        {
            this._quadMemory = new Uint8Array(numQuads * cc.V3F_C4B_T2F_Quad.BYTES_PER_ELEMENT); //get a new internal buffer that is big enough for all of this
            this._quadU32View = new Uint32Array(this._quadMemory.buffer);
            this._quads.length = 0;
            for (var i = 0; i < numQuads; ++i) {
                this._quads.push(new cc.V3F_C4B_T2F_Quad(null, null, null, null, this._quadMemory.buffer, i * cc.V3F_C4B_T2F_Quad.BYTES_PER_ELEMENT));
            }

            this._usedQuads = numQuads;
            this._glBufferDirty = true;
        }
    }

    //returns the number of quads that can be stored in this quadbuffer
    p.getCapacity = function()
    {
        return this._usedQuads;
    }

    p.getQuads = function()
    {
        return this._quads;
    }
    
    p.getGLBuffer = function()
    {
        return this._glBuffer;
    }

    p.updateGLBuffers = function()
    {
        cc.glBindArrayBuffer( this._glBuffer);
        if(this._glBufferDirty)
        {
            gl.bufferData(gl.ARRAY_BUFFER, this._quadMemory, gl.STATIC_DRAW);
            this._glBufferDirty = false;
        }
        else
        {
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._quadMemory);
        }
    }

    return QuadBuffer;
})();