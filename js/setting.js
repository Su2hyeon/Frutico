window.onerror = function(message, source, lineno, colno, error) {
    // 방금 발생한 'reading 0' 에러나 'endShape' 관련 에러를 타겟팅
    if (message.includes("reading '0'") || message.includes("endShape") || message.includes("TypeError")) {
        console.warn("렌더링 오류 감지: 시스템을 재시작합니다.");
        
        // 무한 새로고침 방지를 위해 짧은 지연 후 실행
        setTimeout(() => {
            location.reload();
        }, 500); 
        return true; // 브라우저 기본 에러 로그를 막음
    }
    return false;
};

let world;
let font;
let uploadHandler;
let pg;
let myShader;
let currentText = '';
let currentIndex = 0.5;
let opentypeFont;
let fruticose;
let clickScale = 1.0;
let targetScale = 1.0;
let isFirstTyping = true;
let bgImages = [];
let bgAlpha = 0;
let currentImgIndex = 0;
let imgAlphas = [0, 0, 0];
let bgTime = 0;
let bgScale = 1.0;


const sampleWords = ["Fruticose", "Foliose", "Moss", "Fungus", "Lichen"];
const GROWTH_LIMIT = 1400;  // 점이 이 개수에 도달하면 성장이 서서히 멈춤
const RIGIDITY = 0.5;      // 값이 높을수록 글자의 원래 형태를 더 뻣뻣하게 유지함 (0.1 ~ 0.5 권장)
const DENSITY = 4;  // 점 사이의 최대 거리. 이 값이 커질수록 덜 자라고 모양이 단순해짐 (4~10 권장)
      

var settings = {
    MinDistance: 2.2, //점들이 너무 밀착하지 않아야 뭉갤 부피가 생김. 2추천  //변화 주기 좋음 ⭐️
    MaxDistance: 5,
    RepulsionRadius: 17, // 가지의 두께?
    AttractionForce: 0.2, // 형태를 잡아주는 힘 강화
    RepulsionForce: 0.78, // 높일수록 더 우그러짐
    AlignmentForce: 0.9, //정렬하려는 힘. (곡선을 더 매끄럽게 펴줌) //변화 주기 좋음 ⭐️ 낮추기!! 
    NodeInjectionInterval: 130, //점 주입 속도를 낮춤 (모양유지에 도움)
    FillMode: true, 
    BrownianMotionRange: 0.5,
    MaxVelocity: 1.1, // 움직임 속도 (값들이 클 수록 빨리 움직임)
    Rotation: 0,
    FillColor: "#282828" //0단계 색상
};

window.settings = settings;

function preload() {
    font = loadFont('IBMPlexMono-Bold.otf');
    bgImages[0] = loadImage('bg/bg-01.png'); //1단계
    bgImages[1] = loadImage('bg/bg-02.png');//2단계
    bgImages[2] = loadImage('bg/bg-03.png');//3단계
}
function setup() {
    let canvases = document.querySelectorAll('canvas');
    canvases.forEach(c => c.remove());

    createCanvas(windowWidth, windowHeight);
    colorMode(HSB, 255);

    if(typeof World !== 'undefined') {
        world = new World (this, window.settings);
        world.paths = [];
        window.world = world;
    }

    fruticose = new Fruticose();

    document.body.classList.add("show-placeholder");
    
    // 1. 핸들러는 딱 하나만 전역으로 생성
    uploadHandler = new UploadHandler(this);
    uploadHandler.init();

    const logo = document.querySelector('.Logo');
    const gallery = document.getElementById('font-gallery');
    const footer = document.querySelector('.Footer');

    if (gallery) gallery.classList.add('is-visible');
    if (footer) footer.classList.add('is-visible');

    if (logo && gallery && footer) {
        logo.onclick = () => {
            // 이제 CSS가 클래스 기반이므로 토글이 정상 작동합니다.
            gallery.classList.toggle('is-visible');
            footer.classList.toggle('is-visible');
        };
    }

    // 2. 폰트 드래그 시 변경
    const fontItems = document.querySelectorAll('.font-item');
    fontItems.forEach(item => {
        item.ondragstart = function(e) {
            const url = this.getAttribute('data-font-url');
            // 브라우저마다 호환성이 다르므로 모든 타입으로 저장
            e.dataTransfer.setData("text/plain", url);
            e.dataTransfer.setData("font-url", url);
            console.log("드래그 시작됨:", url);
        };
    });

    // 3. 윈도우 전체 드롭 감지 (가장 높은 우선순위)
    window.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);

    window.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const fontUrl = e.dataTransfer.getData("font-url") || e.dataTransfer.getData("text/plain");
        console.log("드롭 감지! URL:", fontUrl);

        if (fontUrl && uploadHandler) {
            uploadHandler.loadFontFromUrl(fontUrl);
        }
    }, false);

    document.body.classList.add("is-ready");


    const btnExport = document.getElementById('btn-export-png');
    const btnRecord = document.getElementById('btn-record');
    const btnReset = document.getElementById('btn-reset');

    if (btnExport) btnExport.onclick = exportPNG;
    if (btnRecord) btnRecord.onclick = toggleRecording;
    if (btnReset) btnReset.onclick = resetAll;

    let isRecording = false;
    let recorder;
    let chunks = [];

    document.body.classList.add("is-ready");

    const randomWord = random(sampleWords);
    currentText = randomWord;

    const nutritionSlider = document.getElementById('slider-color');
    if (nutritionSlider) {
        nutritionSlider.value = 1;
        nutritionSlider.dispatchEvent(new Event('input')); 
    }

    document.body.classList.remove("show-placeholder");
    const placeholder = document.querySelector('.Placeholder');
    if (placeholder) placeholder.style.display = 'none';

    generateTextGrowth(currentText);
}

function updateMutation() {
    const amountX = sliderW ? parseFloat(sliderW.value) : 0;
    const amountY = sliderH ? parseFloat(sliderH.value) : 0;
    
    // 현재 텍스트와 슬라이더 값을 기반으로 물리 객체 재생성
    (currentText, {
        amountX: amountX,
        amountY: amountY,
        mode: 'warp' // 예시 모드
    });
}


function doubleClicked(event) {
    const mouseEvent = event || window.event;
    if (mouseEvent && mouseEvent.target) {
        if (mouseEvent.target.closest('.Footer') || 
            mouseEvent.target.closest('.Button-Group') ||
            mouseEvent.target.closest('.Logo')){
            return false; 
        }
    }
    if (world) {
        world.clearPaths();
    }
    currentText = "";
    background(255);
    
    isFirstTyping = true;
    
    document.body.classList.add("show-placeholder");
    generateTextGrowth(""); 
    
    if (typeof updatePlaceholderState === 'function') {
        updatePlaceholderState();
    }
}


class Glyph {
    constructor(data, style) {
        // missing initializeProperties 해결
        this.data = data;
        this.path = data.path || (data.getPath ? data.getPath(0, 0, 72) : null);
        this.renderPath = this.path;
        
        // boundingBox가 width, height를 갖도록 계산
        const bbox = data.getBoundingBox();
        this.boundingBox = {
            x: bbox.x1,
            y: bbox.y1,
            width: bbox.x2 - bbox.x1,
            height: bbox.y2 - bbox.y1
        };
        this.p = 1; // 기본 스케일
    }

mutate(settings) {
    if (!this.path) return;
    this.renderPath = JSON.parse(JSON.stringify(this.path));
    // 1. 원본 복제
    //this.renderPath = this.clonePath(this.path);
    
    const { mode, rotationAngle, amountX, amountY } = settings;

    // 2. 경로의 모든 점들을 순회하며 변환
    this.renderPath.commands = this.renderPath.commands.map((cmd, i) => {
        // transformPath를 거쳐 점의 좌표(x, y, x1, y1 등)가 실제로 계산됨
        return this.transformPath(cmd, {
            index: i,
            mode: mode, 
            rotationAngle: rotationAngle,
            amountX: amountX,
            amountY: amountY
        });
    });
}

render(pg) {
    if (!this.renderPath) return;
    const ctx = pg.drawingContext;
    this.renderPath.draw(ctx); 
}
}


class UploadHandler {
    constructor(appInstance) {
        this.VALID_EXTENSIONS = [".woff", ".otf", ".ttf"];
        this.app = appInstance;
    }

    init() {
    }

    handleDrop(e) {
        // setup의 window.drop에서 호출됨
        const fontUrl = e.dataTransfer.getData("font-url") || e.dataTransfer.getData("text/plain");
        if (fontUrl) {
            this.loadFontFromUrl(fontUrl);
        } else if (e.dataTransfer.files.length > 0) {
            this.handleFiles(e.dataTransfer.files);
        }
    }
loadFontFromUrl(url) {
    fetch(url)
        .then(response => response.arrayBuffer())
        .then(buffer => {
            const f = opentype.parse(buffer);
            window.opentypeFont = f;

            // 폰트 이름 추출 로직 (기존 유지)
            let fontName = "Frutico";
            if (f.names && f.names.fontFamily) {
                fontName = f.names.fontFamily.en || Object.values(f.names.fontFamily)[0];
            }
            //currentText = fontName;
            if (!currentText || currentText.trim() === '') {
                currentText = fontName;
            }

            // 안내 문구 숨기기
            document.body.classList.remove("show-placeholder");
            const placeholder = document.querySelector('.Placeholder');
            if (placeholder) { placeholder.style.display = 'none'; }

            font = loadFont(url, () => {
                isFirstTyping = true;
                if (window.world) window.world.clearPaths();

                const nutritionSlider = document.getElementById('slider-color');
                if (nutritionSlider && parseFloat(nutritionSlider.value) === 0) {
                    nutritionSlider.value = 1; 
                    nutritionSlider.dispatchEvent(new Event('input'));
                }

                generateTextGrowth(currentText);
            });
        });
}

    handleFiles(files) {
        [...files].forEach(file => this.uploadFile(file));
    }

    uploadFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const arrayBuffer = event.target.result;
                window.opentypeFont = opentype.parse(arrayBuffer);
                const url = URL.createObjectURL(new Blob([arrayBuffer]));

                font = loadFont(url, () => {
                    isFirstTyping = true;
                    if (window.world) window.world.clearPaths();
                
                // [추가] 폰트 적용 시 Nutrition(배경) 값을 1로 복구하여 배경이 나타나게 함
                const nutritionSlider = document.getElementById('slider-color');
                if (nutritionSlider && parseFloat(nutritionSlider.value) === 0) {
                    nutritionSlider.value = 1; // 0이었다면 최소 1로 올림
                    nutritionSlider.dispatchEvent(new Event('input'));
                }

                generateTextGrowth(currentText);
            });
        } catch (err) { console.error("Font parse error:", err); }
    };
    reader.readAsArrayBuffer(file);
}
}



class Fruticose {
    constructor() {
        this.glyphs = [];
        //this.FILL_COLOR = "#000000";
        //this.STROKE_COLOR = "#ffffff";
        //this.STROKE_WIDTH = "2";
        this.word = "";
        //this.showHelpers = false;
        //this.uploadHandler = new UploadHandler(this);
    }

    // setting.js 내 Fruticose 클래스의 updateGlyphs 부분 점검
updateGlyphs(text) {
    if (!window.opentypeFont) return;
    this.word = text;
    this.glyphs = [];
    
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        // 폰트에서 글자 데이터 추출
        let glyphData = window.opentypeFont.charToGlyph(char);
        
        // Glyph 객체 생성 및 배열 저장
        let newGlyph = new Glyph(glyphData, {
            fillColor: "#000",
            strokeColor: "#fff",
            strokeWidth: 1
        });
        this.glyphs.push(newGlyph);
    }
}

    // 글자 가로 나열, 중앙 정렬, 잔상 제거
    renderWord(pg) {
        pg.clear();
        if (!this.glyphs || this.glyphs.length === 0) return;
        // 전체 단어 폭/최대 높이 계산
        let totalWidth = 0, maxHeight = 0;
        this.glyphs.forEach(glyph => {
            totalWidth += glyph.boundingBox.width * glyph.p;
            if (glyph.boundingBox && glyph.boundingBox.height > maxHeight) {
                maxHeight = glyph.boundingBox.height;
            }
        });
        totalWidth += 300; // app.min.js 스타일 여유
        pg.push();
        const scaleX = 1 / Math.abs(totalWidth / width);
        const scaleY = -scaleX;
        pg.translate(230 * scaleX, height / 2 - maxHeight / 2 * scaleY);
        pg.scale(scaleX, scaleY);
        let accX = 0;
        for (let i = 0; i < this.glyphs.length; i++) {
            let glyph = this.glyphs[i];
            if (i > 0) {
                accX += this.glyphs[i - 1].boundingBox.width * this.glyphs[i - 1].p;
            }
            pg.push();
            pg.translate(accX, 0);
            glyph.render(pg);
            pg.pop();
        }
        pg.pop();
    }
}

function draw() {
    background(255);
    if (!window.world) return;

    if (!window.world.paused) {
        bgTime += 0.1; //animation speed
    }

    const nutritionSlider = document.getElementById('slider-color');
    let nutritionVal = nutritionSlider ? parseFloat(nutritionSlider.value) : 1;
    const wildnessSlider = document.getElementById('slider-rotation');
    const wildnessVal = wildnessSlider ? parseFloat(wildnessSlider.value) : 0;

    let targetIdx = 0;
    if (nutritionVal > 0) {
        targetIdx = floor((nutritionVal - 1) / 33); //수치 33마다 배경이 변경됨
        targetIdx = constrain(targetIdx, 0, 2);
    }

    // 배경 활성화 조건 (글자가 있고 값이 0보다 클 때)
    let shouldShowBg = (currentText.length > 0 && nutritionVal > 0);
    
    // 전체 배경 마스터 투명도 연산
    bgAlpha = lerp(bgAlpha, shouldShowBg ? 255 : 0, 0.3);

    // [중요] 모든 이미지에 대해 개별 알파값 계산
    for (let i = 0; i < imgAlphas.length; i++) {
        if (shouldShowBg && i === targetIdx) {
            imgAlphas[i] = lerp(imgAlphas[i], 255, 0.3); // 현재 구간 이미지는 선명하게
        } else {
            imgAlphas[i] = lerp(imgAlphas[i], 0, 0.3);   // 나머지 이미지는 투명하게
        }
    }


    // 1. Wildness 배경 진동 값 계산
    let shakeX = 0;
    let shakeY = 0;
    let shakeRot = 0;
    
    if (wildnessVal > 3 && !window.world.paused) { 
        let waveIntensity = map(wildnessVal, 0, 100, 0, 2); // 진동 폭 (0~5px)
        let waveSpeed = map(wildnessVal, 0, 100, 0.01, 0.05);
        
        // 화면 전체를 미세하게 흔듦 (지직거리는 진동)
        translate(shakeX, shakeY);

        // 반원형(곡선적) 왜곡 느낌을 위해 미세한 회전 진동 추가
        let wobble = map(wildnessVal, 0, 100, 0, 0.002); 
        rotate(random(-wobble, wobble));
    }



    // 배경 이미지 출력 (기존 루프 로직 유지) + spread 조절 시 배경이 출렁거림
 if (bgAlpha > 1) {
    push();

    const sizeSlider = document.getElementById('slider-size');
    const sizeVal = sizeSlider ? parseFloat(sizeSlider.value) : 50;
    let targetBgScale = map(sizeVal, 0, 100, 1.0, 1.15);
    
    // 2. lerp를 이용한 부드러운 스케일 전환 (0.05 수치로 쫀득함 조절)
    bgScale = lerp(bgScale, targetBgScale, 0.05);

    // 3. 화면 중앙을 기준으로 스케일 적용
    translate(width / 2, height / 2);
    scale(bgScale);
    translate(-width / 2, -height / 2);
    
    // 슬라이더 값들
    let wAmount = (window.settings && window.settings.waveAmount) ? window.settings.waveAmount : 0;
    const wildnessVal = document.getElementById('slider-rotation') ? parseFloat(document.getElementById('slider-rotation').value) : 0;
    const speedVal = document.getElementById('slider-speed') ? parseFloat(document.getElementById('slider-speed').value) : 50;
    

    // 2. 필터 적용
    drawingContext.filter = `blur(${map(speedVal, 0, 100, 0, 4)}px)`;

    for (let i = 0; i < bgImages.length; i++) {
        if (bgImages[i] && imgAlphas[i] > 5) {
            drawingContext.save();
            drawingContext.globalAlpha = (imgAlphas[i] / 255) * (bgAlpha / 255);

            let imgElt = bgImages[i].canvas || bgImages[i].elt;
            
            // [추가] 이미지 비율 유지 계산 (Aspect Fill)
            let imgRatio = imgElt.width / imgElt.height;
            let canvasRatio = width / height;
            let renderW, renderH;

            if (canvasRatio > imgRatio) {
                renderW = width + 100;
                renderH = (width + 100) / imgRatio;
            } else {
                renderH = height + 100;
                renderW = (height + 100) * imgRatio;
            }

            // 중앙 정렬 오프셋
            let offsetX = (width - renderW) / 2;
            let offsetY = (height - renderH) / 2;

            if (wAmount > 3) {
                let strips = 12;
                let hStrip = height / strips;
                let sH = imgElt.height / strips;

                for (let j = 0; j < strips; j++) {
                    // Spread에 의한 가로 찢어짐만 적용 (위아래 찌부 방지)
                    let xDistort = sin(j * 0.4 + bgTime) * map(wAmount, 0, 100, 0, 40);
                    
                    drawingContext.drawImage(
                        imgElt, 0, j * sH, imgElt.width, sH,
                        offsetX + xDistort, offsetY + j * (renderH / strips), 
                        renderW, (renderH / strips) + 1 // 틈새 방지
                    );
                }
            } else {
                // [수정] 강제 width, height 대신 계산된 비율(renderW, renderH) 사용
                drawingContext.drawImage(imgElt, offsetX, offsetY, renderW, renderH);
            }
            drawingContext.restore();
        }
    }
    drawingContext.filter = 'none';
    pop();
}
    let currentRot = (window.settings && window.settings.Rotation) ? window.settings.Rotation : 0;
    
    if (window.world && window.world.paths) { 
        window.world.paths.forEach(path => {
        let cX = path.middleX || width / 2;
        let cY = path.middleY || height / 2;
        let rOffset = path.rotOffset || 0;
        let angle = (currentRot === 0) ? 0 : currentRot + rOffset;

        if (angle !== 0) {
            let cosA = Math.cos(angle);
            let sinA = Math.sin(angle);
            
            path.nodes.forEach(n => {
                let dx = n.x - cX;
                let dy = n.y - cY;
                
                // 현재 좌표를 월드 좌표(회전된 위치)로 일시 변경
                // n.position이 있으면 그것도 업데이트하여 에러 방지
                let wx = cX + (dx * cosA - dy * sinA);
                let wy = cY + (dx * sinA + dy * cosA);
                
                n.x = wx; n.y = wy;
                if (n.position) { n.position.x = wx; n.position.y = wy; }
                
                // 속도(velocity)도 함께 회전시켜야 물리 연산이 튀지 않습니다.
                if (n.velocity) {
                    let vx = n.velocity.x;
                    let vy = n.velocity.y;
                    n.velocity.x = vx * cosA - vy * sinA;
                    n.velocity.y = vx * sinA + vy * cosA;
                }
            });
        }
    });
}

    // 2. 물리 연산 실행 (이제 회전되어 겹친 노드들을 서로 밀어냄)
    if (window.world && typeof window.world.paused !== 'undefined' && !window.world.paused) {
    window.world.iterate();
}

    // 3. 물리 연산 결과를 다시 "로컬 좌표"로 복원
    // 사용자님의 렌더링 로직이 translate/rotate를 쓰기 때문에 다시 되돌려줘야 합니다.
    if (window.world.paths && Array.isArray(window.world.paths)) {
        window.world.paths.forEach(path => {
        let cX = path.middleX || width / 2;
        let cY = path.middleY || height / 2;
        let rOffset = path.rotOffset || 0;
        let angle = (currentRot === 0) ? 0 : currentRot + rOffset;

        if (angle !== 0) {
            let cosA = Math.cos(-angle); // 역회전
            let sinA = Math.sin(-angle);
            
            path.nodes.forEach(n => {
                let dx = n.x - cX;
                let dy = n.y - cY;
                
                let lx = cX + (dx * cosA - dy * sinA);
                let ly = cY + (dx * sinA + dy * cosA);
                
                n.x = lx; n.y = ly;
                if (n.position) { n.position.x = lx; n.position.y = ly; }

                if (n.velocity) {
                    let vx = n.velocity.x;
                    let vy = n.velocity.y;
                    n.velocity.x = vx * cosA - vy * sinA;
                    n.velocity.y = vx * sinA + vy * cosA;
                }
            });
        }
    });
}

    // --- 여기부터는 "훼손 금지" 요청하신 기존 렌더링 코드 ---
    if (window.settings && window.settings.FillColor) {
        fill(window.settings.FillColor);
    } else {
        fill("#282828"); 
    } 
    stroke(255); 
    strokeWeight(1);

    if (currentText !== "") {
        // 모든 글자의 중심(width/2, height/2) 기준으로 마우스가 가까이 있는지 확인
        let d = dist(mouseX, mouseY, width / 2, height / 2);
        
        if (d < 120) { // 300px 거리 내에 마우스가 있으면 호버로 간주
            targetScale = 1.07; 
            isHovering = true;
        } else {
            targetScale = 1.0;
            isHovering = false;
        }
    }

    clickScale = lerp(clickScale, targetScale, 0.6); // 쫀득한 애니메이션 로직 추가. 0.2 조절하여 수정

    let charGroups = {};
    window.world.paths.forEach(path => {
        let id = path.charId !== undefined ? path.charId : -1;
        if (!charGroups[id]) charGroups[id] = [];
        charGroups[id].push(path);
    });

    push();
    translate(width/2, height/2);
    scale(clickScale);
    translate(-width/2, -height/2); 

    Object.keys(charGroups).forEach(id => {
        let pathsInChar = charGroups[id];

        push();
        let cX = pathsInChar[0].middleX || width / 2;
        let cY = pathsInChar[0].middleY || height / 2;
        let rOffset = pathsInChar[0].rotOffset || 0;

        translate(cX, cY); 

        scale(clickScale); 

        if (window.settings && window.settings.Rotation !== undefined) {
            if (window.settings.Rotation === 0) {
                rotate(0);
            } else {
                rotate(window.settings.Rotation + rOffset);
            }
        }
        translate(-cX, -cY);

        beginShape();
        pathsInChar.forEach((path, pIdx) => {
            if (pIdx > 0) beginContour();
            let cX = path.middleX || width / 2; 
            let cY = path.middleY || height / 2;

            path.nodes.forEach((n, idx) => {
            let baseSize = 350; 
            let currentFS = (window.settings && window.settings.FontSize) ? window.settings.FontSize : baseSize;
            let scaleRatio = currentFS / baseSize;

            // [수정] 개별 글자 중심(cX)이 아닌 화면 중앙(width/2)을 기준으로 확장
            // 이렇게 하면 글자 크기가 커질 때 글자 사이의 거리도 scaleRatio만큼 멀어집니다.
            let wordCenterX = width / 2;
            let wordCenterY = height / 2;

            let curX = n.position ? n.position.x : n.x;
            let curY = n.position ? n.position.y : n.y;

            // 기준점을 화면 중앙으로 변경하여 자간까지 배율 적용
            let finalX = wordCenterX + (curX - wordCenterX) * scaleRatio;
            let finalY = wordCenterY + (curY - wordCenterY) * scaleRatio;

            vertex(finalX, finalY); 
        });
            if (pIdx > 0) endContour();
        });
        endShape(CLOSE);
        pop();
    });
    pop();
}


function generateTextGrowth(txt) {
    if (!font || !window.world) return;
    window.world.clearPaths();

    const mutateW = document.getElementById('slider-mutation-w') ? parseFloat(document.getElementById('slider-mutation-w').value) : 0;
    const mutateH = document.getElementById('slider-mutation-h') ? parseFloat(document.getElementById('slider-mutation-h').value) : 0;
    
    // 1. 초기 폰트 크기 계산 및 자동 스케일링
    let fontSize;
    if (window.settings && window.settings.FontSize) {
        fontSize = window.settings.FontSize;
    } else {
       fontSize = constrain(width / (txt.length * 0.8 + 0.7), 100, 500);
       const nutritionSlider = document.getElementById('slider-color');
        if (nutritionSlider && parseFloat(nutritionSlider.value) === 0) {
            nutritionSlider.value = 1; 
            nutritionSlider.dispatchEvent(new Event('input'));
        }
    }

    if (window.opentypeFont && window.opentypeFont.names && window.opentypeFont.names.fontFamily) {
        let fName = window.opentypeFont.names.fontFamily.en || "";
        
        // Bodoni Moda 또는 Bodoni Ornaments 문자열이 포함되어 있는지 확인
        if (fName.includes("Bodoni Ornaments")) {
            fontSize *= 0.7; // 원래 크기의 70%로 축소 (원하는 비율로 조절 가능)
        }
    }

    let bbox = font.textBounds(txt, 0, 0, fontSize);
    let maxWidth = width * 0.8;
    if (bbox.w > maxWidth) {
        fontSize *= (maxWidth / bbox.w);
        bbox = font.textBounds(txt, 0, 0, fontSize);
    }
    
    // 2. [핵심] 시각적 중앙 오프셋 계산 (모든 점의 실제 min/max 측정)
    let allPointsTemp = [];
    let charDataTemp = [];
    let curX = 0;
    for (let i = 0; i < txt.length; i++) {
        let char = txt[i];
        let cBbox = font.textBounds(char, 0, 0, fontSize);
        // 폰트의 기준점이 아닌 '시각적 실체'를 추출하기 위해 bbox.x 보정
        let pts = font.textToPoints(char, curX - cBbox.x, 0, fontSize, { sampleFactor: 0.15 });
        charDataTemp.push({ pts: pts, bbox: cBbox, originX: curX });
        allPointsTemp.push(...pts);
        curX += cBbox.w * 1.15; // 글자 간격 조절
    }

    // 추출된 모든 점의 경계 계산
    let minX = Math.min(...allPointsTemp.map(p => p.x));
    let maxX = Math.max(...allPointsTemp.map(p => p.x));
    let minY = Math.min(...allPointsTemp.map(p => p.y));
    let maxY = Math.max(...allPointsTemp.map(p => p.y));

    // 화면 중앙으로 보내기 위한 최종 오프셋
    let offsetX = (width / 2) - (minX + (maxX - minX) / 2);
    let offsetY = (height / 2) - (minY + (maxY - minY) / 2);

    // 3. 기존의 독립 회전축 및 물리 로직 적용
    charDataTemp.forEach((data, i) => {
        let { pts, bbox, originX } = data;
        let charCenterX = (originX - bbox.x + bbox.w / 2) + offsetX;
        let charCenterY = (bbox.y + bbox.h / 2) + offsetY;
        let randomOffset = random(-PI, PI);

        if (pts.length > 0) {
            let groups = splitPointsIntoGroups(pts); // 기존 그룹화 로직 활용
            groups.forEach(group => {
                if (group.length > 3) {
                    const isClosed = dist(group[0].x, group[0].y, group[group.length - 1].x, group[group.length - 1].y) < 10;
                    let nodes = group.map((p, idx) => {
                        let offX = sin(idx * 0.5) * mutateW;
                        let offY = cos(idx * 0.5) * mutateH;

                        let safeX = constrain(p.x + offsetX + (sin(idx * 0.5) * mutateW), 120, width - 120);
                        let safeY = constrain(p.y + offsetY + (cos(idx * 0.5) * mutateH), 120, height - 120);
                        return new Node(this, safeX, safeY, window.settings);
                    });

                    let textPath = new Path(this, nodes, window.settings, isClosed);
                    textPath.charId = i; 
                    textPath.middleX = charCenterX; // 제자리 회전 유지
                    textPath.middleY = charCenterY;
                    textPath.rotOffset = randomOffset;
                    textPath.personality = {
                        repulsionMult: random(0.5, 2.5), 
                        alignmentMult: random(0.05, 1.5), 
                        growthLimit: floor(random(300, 2000)),
                        speedMult: random(0.5, 1.2)
                    };
                    
                    // 기존 iterate 주입
                    if (typeof injectIterate === 'function') injectIterate(textPath); 
                    window.world.addPath(textPath);
                }
            });
        }
    });
}

// setting.js 파일 하단에 추가
function splitPointsIntoGroups(pts) {
    if (!pts || pts.length === 0) return [];
    
    let groups = [];
    let currentGroup = [pts[0]];
    
    for (let j = 1; j < pts.length; j++) {
        // 점 사이의 거리가 10보다 멀면 새로운 획(Group)으로 간주합니다.
        if (dist(pts[j].x, pts[j].y, pts[j-1].x, pts[j-1].y) > 10) { 
            groups.push(currentGroup);
            currentGroup = [];
        }
        currentGroup.push(pts[j]);
    }
    groups.push(currentGroup);
    return groups;
}

 function injectIterate(path) {
    path.iterate = function(tree) {
        if (world.paused) return;
        if (!this.personality) return;

        let driftVec = createVector(0, 0);

        const p = this.personality;
        const s = window.settings;
        
        // 1. Wind 슬라이더(slider-rotation)에서 궤적 강도 가져오기
        const windSlider = document.getElementById('slider-rotation');
        const wildness = windSlider ? map(windSlider.value, 0, 100, 0, 4.0) : 0; 

        if (wildness > 0 && !world.paused) { // [수정] 멈췄을 땐 힘을 주지 않음
            let time = frameCount * (0.02 + wildness * 0.05);
            let noiseAngle = noise(path.charId * 200, frameCount * 0.8) * TWO_PI * 90;
            let noiseScale = 0.5;
            let nx = (noise(path.charId * 10, time) - 0.5) * wildness * 30;
            let ny = (noise(path.charId * 20, time + 100) - 0.5) * wildness * 30;
            
            driftVec = createVector(nx, ny);
        }

        // 기본 성장 로직
        if (this.nodes.length < p.growthLimit) {
            if (Path.prototype.iterate) Path.prototype.iterate.apply(this, arguments);
        }

        

        this.nodes.forEach((n, idx) => {
            if (!n.acceleration) n.acceleration = createVector(0, 0);
            
            if (wildness > 1.0) {
                n.acceleration.add(p5.Vector.random2D().mult(wildness * 0.2));
            }
            
            // 궤적 힘 적용
            n.acceleration.add(driftVec);

            this.applyRepulsion(idx, tree, s.RepulsionForce * p.repulsionMult); 
            this.applyAlignment(idx, s.AlignmentForce * p.alignmentMult);
            this.applyAttraction(idx);
            
            if (n.acceleration) n.acceleration.mult(p.speedMult);
            n.iterate();
        });

        // 3. [중요] 노드가 이동한 만큼 회전 중심축도 함께 이동 (제자리 회전 방지)
        path.middleX += driftVec.x * 0.5;
        path.middleY += driftVec.y * 0.5;
    };
}

function updateTextSize(txt) {
  // 캔버스 너비와 글자 수를 기준으로 폰트 크기 계산
  // 글자 수가 많아질수록 기본 크기(width/10 등)가 작아지도록 설계
  let dynamicSize = width / (txt.length * 0.8); 
  
  // 최소/최대 크기 제한 (너무 작아지거나 커지는 것 방지)
  dynamicSize = constrain(dynamicSize, 20, 100); 
  
  textSize(dynamicSize);
}

function keyPressed() {
    if (key === ' ') return;
    if (key.length !== 1 && keyCode !== BACKSPACE && keyCode !== DELETE) return;

    if (isFirstTyping && keyCode !== BACKSPACE && keyCode !== DELETE) {
        currentText = ""; //샘플 단어 제거
        if (window.world) window.world.clearPaths();
        background(255);
        isFirstTyping = false; // 일반 타이핑 상태로 전환
       
        // Nutrition 슬라이더를 1로 설정
        const nutritionSlider = document.getElementById('slider-color');
        if (nutritionSlider && parseFloat(nutritionSlider.value) === 0) {
            nutritionSlider.value = 1;
            nutritionSlider.dispatchEvent(new Event('input')); 
        }
    }

    if (keyCode === BACKSPACE || keyCode === DELETE) {
        currentText = currentText.slice(0, -1);
        if(currentText.length > 0) {
            generateTextGrowth(currentText);
        }
        updatePlaceholderState();

        // [추가] 글자가 하나도 남지 않았을 때 (모두 지워졌을 때)
        if (currentText.length === 0) {
            document.body.classList.add("show-placeholder");

            if (window.world) window.world.clearPaths();
            background(255); 
            
            // Nutrition 슬라이더를 0으로 리셋
            const nutritionSlider = document.getElementById('slider-color');
            if (nutritionSlider) {
                nutritionSlider.value = 0;
                // 수치가 바뀌었다고 draw 함수에 신호를 보냄
                nutritionSlider.dispatchEvent(new Event('input')); 
            }
            
            // 다음에 다시 칠 때를 대비해 첫 타이핑 상태로 되돌림 (선택 사항)
            isFirstTyping = true;
        }
    } 
    // 4. 일반 글자 입력 처리
    else if (key.length === 1 && key.match(/^[:;/Ññ.!¡¿=?*$A-Za-z0-9\(\)_]+$/)) {
        document.body.classList.remove("show-placeholder");
        currentText += key;
        generateTextGrowth(currentText);
    }
}

function keyReleased() {
    if (key === ' ') {
        if (world) {
            world.togglePause();
            // [추가] 일시정지에서 풀릴 때 노드들의 속도를 초기화하여 튀는 현상 방지
            if (!world.paused) {
                world.paths.forEach(path => {
                    path.nodes.forEach(n => {
                        if (n.velocity) n.velocity.mult(0.1); 
                    });
                });
            }
        }
    }
}

function addPath(nodes) {
    let textPath = new Path(this, nodes, settings, true);
    const originalIterate = textPath.iterate;
    textPath.iterate = function(tree) {
        if (this.nodes.length > GROWTH_LIMIT) {
            this.nodes.forEach(n => {
                this.applyAttraction(this.nodes.indexOf(n));
                this.applyRepulsion(this.nodes.indexOf(n), tree);
                this.applyAlignment(this.nodes.indexOf(n));
                n.iterate();
            });
            return; 
        }
        originalIterate.apply(this, arguments);
    };
    world.addPath(textPath);
}

function renderGrowthText() {
    fill("#282828");
    stroke(0);
    strokeWeight(1);
    world.paths.forEach(path => {
        beginShape();
        path.nodes.forEach(n => {
            let posX = n.position ? n.position.x : n.x;
            let posY = n.position ? n.position.y : n.y;
            vertex(posX, posY);
        });
        endShape(path.closed ? CLOSE : undefined);
    });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  background(255);
  if (currentText !== "") {
        generateTextGrowth(currentText);
    }
}

// 1. 이미지 저장: 로고와 푸터를 제외한 순수 그래픽만 PNG로 저장합니다.
function exportPNG() {
    saveCanvas(`Frutico_${currentText}`, 'png');
}

// 2. 녹화 기능: 캔버스만 캡처하여 깔끔하게 저장합니다.
let isRecording = false;
let recorder;
let chunks = [];

function toggleRecording() {
    const canvas = document.querySelector('canvas'); // p5 캔버스 요소만 선택
    const btn = document.getElementById('btn-record');

    if (!isRecording) {
        chunks = [];
        // 캔버스 자체의 스트림을 가져와서 UI(버튼, 푸터)는 제외됩니다.
        const stream = canvas.captureStream(30); 
        recorder = new MediaRecorder(stream, { 
            mimeType: 'video/webm; codecs=vp9' 
        });

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/mp4' }); // MIME 타입을 mp4로 시도
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // 파일명을 .mp4로 지정하여 일반 플레이어에서 열리도록 유도
        a.download = `Frutico_Record_${currentText || 'motion'}.mp4`; 
        a.click();
        window.URL.revokeObjectURL(url);
    };

        recorder.start();
        isRecording = true;
        btn.innerText = "Stop Record";
        btn.style.color = "red";
    } else {
        recorder.stop();
        isRecording = false;
        btn.innerText = "Record";
        btn.style.color = ""; 
    }
}

function resetAll() {
    currentText = '';
    if (window.world) {
        window.world.clearPaths();
    }

    window.settings.FillColor = "#282828";

    document.body.classList.add("show-placeholder");
    const placeholder = document.querySelector('.Placeholder');
    if (placeholder) {
        placeholder.style.display = 'block';
    }

    const sliders = [
        { id: 'slider-speed', default: 50 }, //Humidity
        { id: 'slider-rotation', default: 0 }, //Wildness
        { id: 'slider-mutation-w', default: 0 }, //Spread
        { id: 'slider-mutation-h', default: 0 }, //Height
        { id: 'slider-color', default: 1 }, //Nutrition
        { id: 'slider-size', default: 50 } //Font Size
    ];

    sliders.forEach(s => {
        const el = document.getElementById(s.id);
        if (el) {
            el.value = s.default;
            el.dispatchEvent(new Event('input'));   
        }
    });
    
    font = loadFont('IBMPlexMono-Bold.otf', () => {
        // 2. 로드 완료 후 타이핑 상태 초기화 및 물리 연산 비우기
        isFirstTyping = true;
        if (window.world) window.world.clearPaths();
        // 3. 배경 초기화
        background(255);
        console.log("Font reset to IBM Plex Mono Bold");
    });
    background(255);

    ifFistTyping = true;

}

function updatePlaceholderState() {
    const placeholder = document.querySelector('.Placeholder');
    if (!placeholder) return;

    // 글자가 아예 없거나 공백만 있을 때
    if (!currentText || currentText.trim() === '') {
        // 1. 잔상 제거: 물리 엔진의 모든 경로를 즉시 삭제
        if (window.world) window.world.clearPaths(); 
        
        // 2. UI 제어: Placeholder 노출
        document.body.classList.add("show-placeholder");
        placeholder.style.display = 'block';
        
        // 3. 리셋: Nutrition(배경)을 0으로 돌려 흰 화면 유지
        const nutritionSlider = document.getElementById('slider-color');
        if (nutritionSlider) {
            nutritionSlider.value = 0;
            nutritionSlider.dispatchEvent(new Event('input'));
        }
    } else {
        // 글자가 있으면 Placeholder 숨김
        document.body.classList.remove("show-placeholder");
        placeholder.style.display = 'none';
    }
}