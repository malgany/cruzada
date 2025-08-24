
    // ================================================================
    // Utilidades: PRNG com seed (Mulberry32) e helpers
    // ================================================================
    function mulberry32(a){
        return function(){
          var t = a += 0x6D2B79F5;
          t = Math.imul(t ^ t >>> 15, t | 1);
          t ^= t + Math.imul(t ^ t >>> 7, t | 61);
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
      }
      function seededShuffle(arr, rand){
        const a = arr.slice();
        for(let i=a.length-1;i>0;i--){
          const j = Math.floor(rand()* (i+1));
          [a[i],a[j]]=[a[j],a[i]];
        }
        return a;
      }
      function toUpperPT(str){
        // Mantém acentos, apenas sobe para maiúsculas
        return str.toLocaleUpperCase('pt-BR');
      }
  
      // ================================================================
      // Classe WordPlacer: posiciona palavras em estilo palavras cruzadas
      // ================================================================
      class WordPlacer{
        /**
         * @param {Object} options
         * gridSize: number (default 30)
         * center: {row, col} opcional (default calculado por gridSize)
         * minWords: number (default 2)
         * maxWords: number (default 5)
         * maxAttemptsPerWord: number (default 100)
         * dictionary: string[] | null (pode ser setado depois)
         * seed: string|number|undefined (opcional)
         */
        constructor(options={}){
          this.gridSize = options.gridSize ?? 30;
          this.center = options.center ?? {row: Math.floor(this.gridSize/2), col: Math.floor(this.gridSize/2)};
          this.minWords = options.minWords ?? 2;
          this.maxWords = options.maxWords ?? 5;
          this.maxAttemptsPerWord = options.maxAttemptsPerWord ?? 100;
          this.rawDictionary = options.dictionary ?? [];
          this.seed = options.seed;
  
          this.rand = typeof this.seed !== 'undefined' && this.seed !== ''
            ? mulberry32(this.hashSeed(String(this.seed)))
            : Math.random;
  
          this.reset();
        }
  
        hashSeed(s){
          // hash simples para transformar string em 32-bit uint
          let h = 2166136261 >>> 0;
          for(let i=0; i<s.length; i++){
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          return h >>> 0;
        }
  
        reset(){
          this.grid = Array.from({length:this.gridSize}, ()=>Array(this.gridSize).fill(null));
          this.placed = []; // lista de {word, orientation, start, positions}
          this.usedWords = new Set();
          this.logs = [];
        }
  
        log(msg){ this.logs.push(msg); }
  
        loadDictionary(dict){
          // Aceita: array simples ["casa",...] ou objeto {words:[...]}
          const arr = Array.isArray(dict) ? dict : (dict && Array.isArray(dict.words) ? dict.words : []);
          // Filtra strings válidas que cabem no grid
          const cleaned = arr
            .map(w=>String(w).trim())
            .filter(Boolean)
            .filter(w=>w.length <= this.gridSize);
          this.rawDictionary = cleaned;
          return cleaned;
        }
  
        get dictionary(){
          // Uppercase e sem duplicatas
          const uniq = [...new Set(this.rawDictionary.map(w=>toUpperPT(w)))];
          return uniq;
        }
  
        pickN(){
          const nMin = Math.max(1, this.minWords|0);
          const nMax = Math.max(nMin, this.maxWords|0);
          const nRange = nMax - nMin + 1;
          return nMin + Math.floor(this.rand()*nRange);
        }
  
        // desenha linhas e letras
        drawOnCanvas(canvas, opts={}){
          const cellSize = opts.cellSize ?? 24;
          const fontScale = Math.max(40, Math.min(100, (opts.fontScale ?? 70))) / 100; // 0.4..1.0
          canvas.width = this.gridSize * cellSize;
          canvas.height = this.gridSize * cellSize;
          const ctx = canvas.getContext('2d');
  
          // Fundo
          ctx.fillStyle = '#0b1227';
          ctx.fillRect(0,0,canvas.width, canvas.height);
  
          // Linhas
          ctx.strokeStyle = '#1f2937';
          ctx.lineWidth = 1;
          for(let i=0;i<=this.gridSize;i++){
            const p = i*cellSize + .5;
            ctx.beginPath(); ctx.moveTo(.5, p); ctx.lineTo(canvas.width-.5, p); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(p, .5); ctx.lineTo(p, canvas.height-.5); ctx.stroke();
          }
  
          // Letras
          ctx.fillStyle = '#e5e7eb';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `${Math.floor(cellSize*fontScale)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
          for(let r=0;r<this.gridSize;r++){
            for(let c=0;c<this.gridSize;c++){
              const ch = this.grid[r][c];
              if(ch){
                const x = c*cellSize + cellSize/2;
                const y = r*cellSize + cellSize/2;
                ctx.fillText(ch, x, y);
              }
            }
          }
  
          // Centro (marcador sutil)
          ctx.strokeStyle = 'rgba(34,211,238,.6)';
          ctx.lineWidth = 2;
          ctx.strokeRect(this.center.col*cellSize+1.5, this.center.row*cellSize+1.5, cellSize-3, cellSize-3);
        }
  
        // Tenta posicionar N palavras seguindo as regras
        placeWords(){
          const words = this.dictionary;
          if(words.length === 0){ this.log('Dicionário vazio.'); return []; }
  
          const N = this.pickN();
          this.log(`Alvo: colocar ${N} palavra(s). Dicionário disponível: ${words.length}.`);
  
          // embaralha com seed (se houver)
          const shuffledAll = (this.rand === Math.random) ? words.slice() : seededShuffle(words, this.rand);
  
          // 1) Primeira palavra: encontrar a primeira que caiba centralizando a letra do meio
          let first = null;
          for(const w of shuffledAll){
            const placed = this.placeFirstWord(w);
            if(placed){
              first = w; break;
            }
          }
          if(!first){
            this.log('Não foi possível posicionar a primeira palavra no centro.');
            return this.placed;
          }
  
          // 2) Palavras seguintes: alterna orientação e cruza com a última palavra
          while(this.placed.length < N){
            const success = this.tryPlaceNextWord(shuffledAll);
            if(!success){
              this.log('Não foi possível posicionar mais palavras sem violar as regras. Encerrando.');
              break;
            }
          }
  
          return this.placed;
        }
  
        placeFirstWord(word){
          const W = word;
          const len = W.length;
          // índice do "meio" conforme regra: Math.floor((len-1)/2)
          const midIdx = Math.floor((len-1)/2);
  
          // orientação aleatória
          const ori = (this.rand() < .5) ? 'horizontal' : 'vertical';
  
          let startRow, startCol;
          if(ori === 'horizontal'){
            startRow = this.center.row;
            startCol = this.center.col - midIdx;
            if(startCol < 0 || (startCol + len - 1) >= this.gridSize) return false;
          } else {
            startCol = this.center.col;
            startRow = this.center.row - midIdx;
            if(startRow < 0 || (startRow + len - 1) >= this.gridSize) return false;
          }
  
          // verificar conflitos (primeira palavra: apenas verificar bordas)
          for(let i=0;i<len;i++){
            const r = ori==='horizontal' ? startRow : startRow + i;
            const c = ori==='horizontal' ? startCol + i : startCol;
            const cell = this.grid[r][c];
            if(cell && cell !== W[i]){
              return false;
            }
          }
          // gravar
          const positions = [];
          for(let i=0;i<len;i++){
            const r = ori==='horizontal' ? startRow : startRow + i;
            const c = ori==='horizontal' ? startCol + i : startCol;
            this.grid[r][c] = W[i];
            positions.push({char:W[i], row:r, col:c});
          }
          this.placed.push({word:W, orientation:ori, start:{row:startRow, col:startCol}, positions});
          this.usedWords.add(W);
          this.log(`Primeira palavra: ${W} (${ori}), meio na célula (${this.center.row},${this.center.col}).`);
          return true;
        }
  
        tryPlaceNextWord(pool){
          if(this.placed.length === 0) return false;
          const last = this.placed[this.placed.length-1];
          const nextOri = last.orientation === 'horizontal' ? 'vertical' : 'horizontal';
  
          let attempts = 0;
          const candidates = pool.filter(w=>!this.usedWords.has(w) && w.length <= this.gridSize);
          if(candidates.length === 0) return false;
  
          // embaralhar candidatos para variar
          const bag = (this.rand === Math.random) ? candidates.slice() : seededShuffle(candidates, this.rand);
  
          // mapa de letras -> lista de coordenadas na última palavra
          const lastMap = new Map();
          last.positions.forEach((p, idx)=>{
            const ch = last.word[idx];
            if(!lastMap.has(ch)) lastMap.set(ch, []);
            lastMap.get(ch).push({idx, ...p});
          });
  
          while(attempts < this.maxAttemptsPerWord && bag.length){
            const cand = bag.pop(); // pega um
            attempts++;
  
            // encontrar todos os índices da letra que batem com letras da última
            const matchIndexes = [];
            for(let j=0;j<cand.length;j++){
              const ch = cand[j];
              if(lastMap.has(ch)){
                for(const pos of lastMap.get(ch)){
                  matchIndexes.push({j, lastPos:pos});
                }
              }
            }
            // aleatoriza as combinações de cruzamento
            const tries = (this.rand === Math.random) ? matchIndexes : seededShuffle(matchIndexes, this.rand);
  
            for(const {j, lastPos} of tries){
              // calcular start para alinhar cand[j] na célula lastPos(row,col)
              let startRow, startCol;
              if(nextOri==='horizontal'){
                startRow = lastPos.row;
                startCol = lastPos.col - j;
                if(startCol < 0 || (startCol + cand.length - 1) >= this.gridSize) continue;
              }else{
                startCol = lastPos.col;
                startRow = lastPos.row - j;
                if(startRow < 0 || (startRow + cand.length - 1) >= this.gridSize) continue;
              }
  
              // verificar conflitos: cada célula deve ser null ou a mesma letra
              let ok = true;
              for(let i=0;i<cand.length;i++){
                const r = nextOri==='horizontal' ? startRow : startRow + i;
                const c = nextOri==='horizontal' ? startCol + i : startCol;
                const cell = this.grid[r][c];
                if(cell && cell !== cand[i]){ ok = false; break; }
              }
              if(!ok) continue;
  
              // grava
              const positions = [];
              for(let i=0;i<cand.length;i++){
                const r = nextOri==='horizontal' ? startRow : startRow + i;
                const c = nextOri==='horizontal' ? startCol + i : startCol;
                this.grid[r][c] = cand[i];
                positions.push({char:cand[i], row:r, col:c});
              }
              this.placed.push({word:cand, orientation:nextOri, start:{row:startRow, col:startCol}, positions});
              this.usedWords.add(cand);
              this.log(`Colocada: ${cand} (${nextOri}) cruzando '${last.word}' em (${lastPos.row},${lastPos.col}) [letra '${cand[j]}'].`);
              return true;
            }
          }
          this.log(`Falha ao encaixar próxima palavra após ${attempts} tentativa(s).`);
          return false;
        }
      }
  
      // ================================================================
      // App: integra UI + Canvas + WordPlacer
      // ================================================================
      const els = {
        canvas: document.getElementById('board'),
        gridSize: document.getElementById('gridSize'),
        minWords: document.getElementById('minWords'),
        maxWords: document.getElementById('maxWords'),
        cellSize: document.getElementById('cellSize'),
        fontScale: document.getElementById('fontScale'),
        seed: document.getElementById('seed'),
        dictFile: document.getElementById('dictFile'),
        dictPaste: document.getElementById('dictPaste'),
        btnGenerate: document.getElementById('btnGenerate'),
        btnReset: document.getElementById('btnReset'),
        logs: document.getElementById('logs'),
        summary: document.getElementById('summary'),
      };
  
      const defaultDict = ["casa","computador","livro","sol","mesa","janela","porta","carro","amigo","floresta","rio","luz","tempo","caminho","sorriso","brasil","noite","tarde","manhã","cidade","praia","montanha","vila","cachorro","gato","festa","musica","vento","chuva","neve"];
  
      let placer = null;
  
      function readUserDictionary(){
        // Prioridade: textarea > arquivo > default
        const pasted = els.dictPaste.value.trim();
        if(pasted){
          try{
            const j = JSON.parse(pasted);
            return Array.isArray(j) ? j : (j && Array.isArray(j.words) ? j.words : defaultDict);
          }catch(e){
            alert('JSON inválido no campo de colagem. Usando dicionário padrão.');
            return defaultDict;
          }
        }
        const file = els.dictFile.files && els.dictFile.files[0];
        if(file){
          // Atenção: leitura assíncrona. Aqui retornamos uma Promise que resolve para o array.
          return new Promise((resolve)=>{
            const fr = new FileReader();
            fr.onload = ()=>{
              try{
                const j = JSON.parse(fr.result);
                resolve(Array.isArray(j) ? j : (j && Array.isArray(j.words) ? j.words : defaultDict));
              }catch(e){ resolve(defaultDict); }
            };
            fr.onerror = ()=>resolve(defaultDict);
            fr.readAsText(file);
          });
        }
        return defaultDict;
      }
  
      function printSummary(placed){
        if(!placed || !placed.length){ els.summary.innerHTML = '<em>Nenhuma palavra posicionada.</em>'; return; }
        const items = placed.map((p,i)=>{
          const span = `<span class="badge">${p.orientation}</span>`;
          return `<div class="kvs"><div><strong>${i+1}. ${p.word}</strong> ${span}</div><div>(${p.start.row},${p.start.col})</div></div>`;
        }).join('');
        els.summary.innerHTML = items;
      }
  
      function flushLogs(){ els.logs.textContent = placer ? placer.logs.join('\n') : ''; }
  
      async function generate(){
        const gridSize = parseInt(els.gridSize.value)||30;
        const minWords = parseInt(els.minWords.value)||2;
        const maxWords = parseInt(els.maxWords.value)||5;
        const cellSize = parseInt(els.cellSize.value)||24;
        const fontScale = parseInt(els.fontScale.value)||70;
        const seed = els.seed.value.trim();
  
        let dictData = await readUserDictionary();
        // Caso FileReader retornou Promise
        if(dictData && typeof dictData.then === 'function'){
          dictData = await dictData;
        }
  
        placer = new WordPlacer({gridSize, minWords, maxWords, dictionary: dictData, seed});
        placer.reset();
        // Normaliza dicionário para uppercase
        placer.loadDictionary(dictData);
        // Substitui dicionário por uppercase internamente (feito em getter)
  
        const placed = placer.placeWords();
        placer.drawOnCanvas(els.canvas, {cellSize, fontScale});
        printSummary(placed);
        flushLogs();
      }
  
      function resetAll(){
        if(!placer){
          const gridSize = parseInt(els.gridSize.value)||30;
          placer = new WordPlacer({gridSize});
        }
        placer.reset();
        placer.drawOnCanvas(els.canvas, {cellSize: parseInt(els.cellSize.value)||24, fontScale: parseInt(els.fontScale.value)||70});
        els.summary.innerHTML = '';
        flushLogs();
      }
  
      // Eventos
      els.btnGenerate.addEventListener('click', generate);
      els.btnReset.addEventListener('click', resetAll);
  
      // Render inicial
      resetAll();