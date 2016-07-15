/****************************************************************************
 Copyright (c) 2013-2014 Chukong Technologies Inc.

 http://www.cocos2d-x.org

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

//Sprite's WebGL render command
(function() {
    var _cc = cc;
    cc.Sprite.WebGLRenderCmd = function (renderable) {
        cc.Node.WebGLRenderCmd.call(this, renderable);
        this._needDraw = true;
        this._quadU32View = new Uint32Array(cc.V3F_C4B_T2F_Quad.BYTES_PER_ELEMENT / 4);
        this._setQuadVertices(this._quadU32View);
        this._firstQuad = -1;
        this._batchedCount = 1;
        this._batchShader = cc.shaderCache.programForKey(cc.SHADER_POSITION_TEXTURECOLORALPHATEST_BATCHED);
    };

    var proto = cc.Sprite.WebGLRenderCmd.prototype = Object.create(cc.Node.WebGLRenderCmd.prototype);

    proto.constructor = cc.Sprite.WebGLRenderCmd;

    proto.updateBlendFunc = function (blendFunc) {};
    proto.geometryType = cc.geometryTypes.QUAD;
    proto._numQuads = 1; //this stays static, one sprite is always one quad

    proto.setDirtyFlag = function(dirtyFlag){
        _cc.Node.WebGLRenderCmd.prototype.setDirtyFlag.call(this, dirtyFlag);
    };

    proto._handleTextureForRotatedTexture = function (texture) {
        return texture;
    };

    proto.isFrameDisplayed = function (frame) {
        var node = this._node;
        return (cc.rectEqualToRect(frame.getRect(), node._rect) && frame.getTexture().getName() === node._texture.getName()
            && cc.pointEqualToPoint(frame.getOffset(), node._unflippedOffsetPositionFromCenter));
    };

    proto.transform = function (parentCmd, recursive) {
        //if(!this._node.isVisible()) return;
        var t4x4 = this._transform4x4, stackMatrix = this._stackMatrix, node = this._node;
        var parentMatrix = parentCmd._stackMatrix;

        var rect = node._rect;
        var offset = node._offsetPosition;

        // Convert 3x3 into 4x4 matrix
        var trans = this.getNodeToParentTransform();

        this._dirtyFlag = this._dirtyFlag & cc.Node._dirtyFlags.transformDirty ^ this._dirtyFlag;

        var t4x4Mat = t4x4.mat;
        t4x4Mat[0] = trans.a * rect.width;
        t4x4Mat[4] = trans.c * rect.height;
        t4x4Mat[12] = trans.a * offset.x + trans.c * offset.y + trans.tx;
        t4x4Mat[1] = trans.b * rect.width;
        t4x4Mat[5] = trans.d * rect.height;
        t4x4Mat[13] = trans.b * offset.x + trans.d * offset.y + trans.ty;

        //optimize performance for Javascript
        _cc.kmMat4Multiply(stackMatrix, parentMatrix, t4x4);

        //this.setRenderZ(parentCmd, stackMatrix);

        if (!recursive || !node._children)
            return;
        var i, len, locChildren = node._children;
        for (i = 0, len = locChildren.length; i < len; i++) {
            locChildren[i]._renderCmd.transform(this, recursive);
        }
    };

    proto._init = function () {
        cc.flatQuadSetColor(this._quadU32View, 255, 255, 255, 255);
    };

    proto._setQuadVertices = function (u32View)
    {
        var f32View = new Float32Array(u32View.buffer);
        
        var stride = cc.V3F_C4B_T2F.BYTES_PER_ELEMENT / 4;
        //it's a 1x1  quad so we just set appropriate indices to 1
        f32View[0] = 0; f32View[1] = 1;
        f32View[stride] = 0; f32View[stride + 1] = 0;
        f32View[stride*2] = 1; f32View[stride*2 + 1] = 1;
        f32View[stride*3] = 1; f32View[stride*3 + 1] = 0;
    };

    proto.getQuad = function () {
        return this._quad;
    };

    proto._updateForSetSpriteFrame = function () {};

    proto._spriteFrameLoadedCallback = function (spriteFrame) {
        this.setTextureRect(spriteFrame.getRect(), spriteFrame.isRotated(), spriteFrame.getOriginalSize());
        this.dispatchEvent("load");
    };

    proto._textureLoadedCallback = function (sender) {
        var renderCmd = this._renderCmd;
        if (this._textureLoaded)
            return;

        this._textureLoaded = true;
        var locRect = this._rect;
        if (!locRect) {
            locRect = cc.rect(0, 0, sender.width, sender.height);
        } else if (cc._rectEqualToZero(locRect)) {
            locRect.width = sender.width;
            locRect.height = sender.height;
        }

        this.texture = sender;
        this.setTextureRect(locRect, this._rectRotated);

        this.dispatchEvent("load");
    };

    proto._setTextureCoords = function (rect, needConvert) {
        if (needConvert === undefined)
            needConvert = true;
        if (needConvert)
            rect = cc.rectPointsToPixels(rect);
        var node = this._node;

        var tex =node._texture;
        if (!tex)
            return;

        var atlasWidth = tex.pixelsWidth;
        var atlasHeight = tex.pixelsHeight;

        var left, right, top, bottom, tempSwap;

        if (node._rectRotated) {
            if (cc.FIX_ARTIFACTS_BY_STRECHING_TEXEL) {
                left = (2 * rect.x + 1) / (2 * atlasWidth);
                right = left + (rect.height * 2 - 2) / (2 * atlasWidth);
                top = (2 * rect.y + 1) / (2 * atlasHeight);
                bottom = top + (rect.width * 2 - 2) / (2 * atlasHeight);
            } else {
                left = rect.x / atlasWidth;
                right = (rect.x + rect.height) / atlasWidth;
                top = rect.y / atlasHeight;
                bottom = (rect.y + rect.width) / atlasHeight;
            }

            if (node._flippedX) {
                tempSwap = top;
                top = bottom;
                bottom = tempSwap;
            }

            if (node._flippedY) {
                tempSwap = left;
                left = right;
                right = tempSwap;
            }

            cc.flatQuadSetTexCoords(this._quadU32View, right, top, left,top,right,bottom,left,bottom);
        } else {
            if (cc.FIX_ARTIFACTS_BY_STRECHING_TEXEL) {
                left = (2 * rect.x + 1) / (2 * atlasWidth);
                right = left + (rect.width * 2 - 2) / (2 * atlasWidth);
                top = (2 * rect.y + 1) / (2 * atlasHeight);
                bottom = top + (rect.height * 2 - 2) / (2 * atlasHeight);
            } else {
                left = rect.x / atlasWidth;
                right = (rect.x + rect.width) / atlasWidth;
                top = rect.y / atlasHeight;
                bottom = (rect.y + rect.height) / atlasHeight;
            }

            if (node._flippedX) {
                tempSwap = left;
                left = right;
                right = tempSwap;
            }

            if (node._flippedY) {
                tempSwap = top;
                top = bottom;
                bottom = tempSwap;
            }

            cc.flatQuadSetTexCoords(this._quadU32View, left,top,left,bottom,right,top,right,bottom );
        }
    };

    proto._setColorDirty = function () {};

    proto._updateColor = function () {
        var locDisplayedColor = this._displayedColor, locDisplayedOpacity = this._displayedOpacity, node = this._node;
        var r = locDisplayedColor.r, g = locDisplayedColor.g, b = locDisplayedColor.b;
        // special opacity for premultiplied textures
        if (node._opacityModifyRGB) {
            r *= locDisplayedOpacity / 255.0;
            g *= locDisplayedOpacity / 255.0;
            b *= locDisplayedOpacity / 255.0;
        }

        cc.flatQuadSetColor(this._quadU32View, r, g, b, locDisplayedOpacity);

        this._quadDirty = true;
    };

    proto._updateBlendFunc = function () {
        if (this._batchNode) {
            cc.log(cc._LogInfos.Sprite__updateBlendFunc);
            return;
        }

        // it's possible to have an untextured sprite
        var node = this._node,
            blendFunc = node._blendFunc;
        if (!node._texture || !node._texture.hasPremultipliedAlpha()) {
            if (blendFunc.src === cc.ONE && blendFunc.dst === cc.BLEND_DST) {
                blendFunc.src = cc.SRC_ALPHA;
            }
            node.opacityModifyRGB = false;
        } else {
            if (blendFunc.src === cc.SRC_ALPHA && blendFunc.dst === cc.BLEND_DST) {
                blendFunc.src = cc.ONE;
            }
            node.opacityModifyRGB = true;
        }
    };

    proto._setTexture = function (texture) {
        var node = this._node;
        // If batchnode, then texture id should be the same
        if (node._batchNode) {
            if(node._batchNode.texture !== texture){
                cc.log(cc._LogInfos.Sprite_setTexture);
                return;
            }
        }else{
            if(node._texture !== texture){
                node._textureLoaded = texture ? texture._textureLoaded : false;
                node._texture = texture;
                this._updateBlendFunc();
            }
        }

        if (texture)
            this._shaderProgram = cc.shaderCache.programForKey(cc.SHADER_POSITION_TEXTURECOLORALPHATEST);
        else
            this._shaderProgram = cc.shaderCache.programForKey(cc.SHADER_POSITION_COLOR);

    };

    proto._checkTextureBoundary = function (texture, rect, rotated) {
        if (texture && texture.url) {
            var _x, _y;
            if (rotated) {
                _x = rect.x + rect.height;
                _y = rect.y + rect.width;
            } else {
                _x = rect.x + rect.width;
                _y = rect.y + rect.height;
            }
            if (_x > texture.width) {
                cc.error(cc._LogInfos.RectWidth, texture.url);
            }
            if (_y > texture.height) {
                cc.error(cc._LogInfos.RectHeight, texture.url);
            }
        }
    };

    proto.rendering = function (ctx) {
        var node = this._node, locTexture = node._texture;

        var gl = ctx;
        
        var program = this._shaderProgram;
         if (locTexture) {
                program.use();
                program._setUniformForMVPMatrixWithMat4(this._stackMatrix);

                cc.glBlendFunc(node._blendFunc.src, node._blendFunc.dst);

                cc.glBindTexture2DN(0, locTexture);                   // = cc.glBindTexture2D(locTexture);
                cc.glEnableVertexAttribs(cc.VERTEX_ATTRIB_FLAG_POS_COLOR_TEX);

                cc.glBindVertexFormat(cc.renderer.vertexFormats[1]);
                
                gl.drawArrays(gl.TRIANGLE_STRIP, this._firstQuad * 4, 4);
        } else {
            program.use();
            program._setUniformForMVPMatrixWithMat4(this._stackMatrix);

            cc.glBlendFunc(node._blendFunc.src, node._blendFunc.dst);
            cc.glBindTexture2D(null);

            cc.glBindVertexFormat(cc.renderer.vertexFormats[1]);
            
            gl.drawArrays(gl.TRIANGLE_STRIP, this._firstQuad * 4, 4);
        }
        
       
        cc.g_NumberOfDraws++;
    };
})();