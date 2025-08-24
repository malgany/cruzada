
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
          // Permite de 2 a 15 palavras na cruzada por padrão
          this.maxWords = options.maxWords ?? 15;
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
          // Garante pelo menos 2 palavras
          const nMin = Math.max(2, this.minWords|0);
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

        // Verifica se uma palavra pode ser posicionada em (startRow,startCol)
        // respeitando cruzamentos e mantendo vizinhança vazia
        isValidPlacement(word, startRow, startCol, orientation){
          const len = word.length;
          const positions = [];
          const posSet = new Set();

          // 1) verificar células alvo
          for(let i=0;i<len;i++){
            const r = orientation==='horizontal' ? startRow : startRow + i;
            const c = orientation==='horizontal' ? startCol + i : startCol;
            if(r<0 || r>=this.gridSize || c<0 || c>=this.gridSize) return false;
            positions.push([r,c]);
            posSet.add(`${r},${c}`);
            const cell = this.grid[r][c];
            if(cell && cell !== word[i]) return false;
          }

          // 2) verificar vizinhança ao redor de cada letra
          for(let i=0;i<len;i++){
            const [r,c] = positions[i];
            const isCross = !!this.grid[r][c];
            for(let dr=-1; dr<=1; dr++){
              for(let dc=-1; dc<=1; dc++){
                if(dr===0 && dc===0) continue;
                const nr = r + dr;
                const nc = c + dc;
                if(nr<0 || nr>=this.gridSize || nc<0 || nc>=this.gridSize) continue;
                if(posSet.has(`${nr},${nc}`)) continue;
                if(isCross){
                  if(orientation==='horizontal' && dc===0 && (dr===1 || dr===-1)) continue;
                  if(orientation==='vertical' && dr===0 && (dc===1 || dc===-1)) continue;
                }
                if(this.grid[nr][nc]) return false;
              }
            }
          }

          return true;
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
  
          if(!this.isValidPlacement(W, startRow, startCol, ori)) return false;
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
  
              if(!this.isValidPlacement(cand, startRow, startCol, nextOri)) continue;

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
          startScreen: document.getElementById('startScreen'),
          startBtn: document.getElementById('startBtn'),
          helpBtn: document.getElementById('helpBtn'),
          helpModal: document.getElementById('helpModal'),
          helpOverlay: document.getElementById('helpOverlay'),
        };
  
      const defaultDict = ["casa","computador","livro","sol","mesa","janela","porta","carro","amigo","floresta","rio","luz","tempo","caminho","sorriso","brasil","noite","tarde","manhã","cidade","praia","montanha","vila","cachorro","gato","festa","musica","vento","chuva","neve"];
  
      let placer = null;
  
      function generate(){
        const gridSize = 30;
        const minWords = 2;
        // Garante que ao menos 2 e no máximo 15 palavras sejam usadas
        const maxWords = 15;
        const cellSize = 24;
        const fontScale = 70;
        const dictData = defaultDict;

        placer = new WordPlacer({gridSize, minWords, maxWords, dictionary: dictData});
        placer.reset();
        placer.loadDictionary(dictData);
        placer.placeWords();
        placer.drawOnCanvas(els.canvas, {cellSize, fontScale});
        printSummary();
        flushLogs();
      }

      function printSummary(){
        if(!placer) return;
        console.table(placer.placed);
      }

      function flushLogs(){
        if(!placer) return;
        console.log(placer.logs.join('\n'));
      }

        els.startBtn.addEventListener('click', () => {
          els.startScreen.classList.add('hidden');
          generate();
        });

        els.helpBtn.addEventListener('click', () => {
          els.helpModal.classList.toggle('hidden');
          els.helpOverlay.classList.toggle('hidden');
        });

        els.helpOverlay.addEventListener('click', () => {
          els.helpModal.classList.add('hidden');
          els.helpOverlay.classList.add('hidden');
        });
