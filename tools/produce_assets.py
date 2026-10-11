"""One-time authoring recipe. Not part of npm build; outputs are committed."""
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TMP = Path('/tmp/coil-authoring')
TMP.mkdir(exist_ok=True)

def call(binary, config, *args):
    subprocess.run([binary, '--config', str(config), *map(str, args)], check=True, stdout=subprocess.DEVNULL)

def config(name, data):
    p = TMP / (name + '.json')
    p.write_text(json.dumps(data))
    return p

colors = ['#153e42', '#217b73', '#39bda0', '#73f4ba', '#d8ffe1']

def pixel(kind, x, y, frame=0):
    if kind == 'corner':
        r = math.hypot(31.5-x, 31.5-y)
        if not 8 <= r <= 25: return None
        c = 0 if r > 23 or r < 10 else 1 if r < 13 else 2 if r < 20 else 3
        if 17 < r < 20 and (x+y) % 9 < 2: c = 1
        return colors[c]
    if kind == 'tail':
        half = min(9, (x+2)*0.32)
        d = abs(y-15.5)
        if d > half: return None
        return colors[0 if d > half-2 else 3 if y < 14 else 2 if y < 19 else 1]
    if kind == 'body':
        if not 7 <= y <= 24: return None
        c = 0 if y in (7,24) else 3 if y in (9,10) else 1 if y>=21 else 2
        if 13 <= y <= 18 and (x + (3 if y>15 else 0)) % 12 < 2: c = 1
        if y==13 and x%12 in (4,5,6): c=3
        return colors[c]
    # Armored, arrow-shaped head; eyes and split jaw are readable at native size.
    top = 7 if x<8 else 4 if x<23 else 6 if x<28 else 9
    if not top <= y <= 31-top: return None
    opening = [0,3,7,3][frame]
    if x>19 and abs(y-15.5) < opening * (x-19)/12: return None
    c=0 if y in (top,31-top) else 3 if y<14 else 2
    if y==top+1 or (x<23 and y==top+2): c=4
    if x in range(19,25) and y in range(8,13): return '#09252c'
    if x in (22,23) and y in (8,9,10): return '#fff6c8'
    if x<8 and y>20: c=1
    if x>26 and y in (13,18) and opening: c=4
    return colors[c]

for kind in ['body','corner','tail','head']:
    sheet = kind=='head'
    data={'width':32,'height':32,'background':'#00000000',
          'layers':str(TMP / (kind+'.layers.json')),
          'actions':str(TMP / (kind+'-{frame}.actions.json' if sheet else kind+'.actions.json')),
          'preview':str(ROOT / ('assets/snake/head/{frame}.png' if sheet else 'assets/snake/'+kind+'.png'))}
    if sheet: data['frames']=[0,1,2,3]
    cfg=config(kind,data); binary='draw-sheet' if sheet else 'draw';call(binary,cfg,'init')
    for frame in range(4 if sheet else 1):
        for y in range(32):
            x=0
            while x<32:
                color=pixel(kind,x,y,frame);end=x+1
                while end<32 and pixel(kind,end,y,frame)==color:end+=1
                if color:
                    prefix=['--frame',frame] if sheet else []
                    call(binary,cfg,*prefix,'fill-rect','--x',x,'--y',y,'--width',end-x,'--height',1,'--color',color)
                x=end

for name,dur,voices in [
    ('eat',85,[('triangle',740,0,70,-15),('sine',1480,0,35,-23)]),
    ('combo-up',230,[('triangle',1175,0,90,-20),('sine',1568,55,100,-20),('triangle',2093,110,100,-23)]),
    ('death',700,[('saw',110,0,480,-21),('sine',65,0,650,-13),('noise',440,0,160,-27)])]:
    cfg=config(name,{'sample_rate':44100,'channels':'stereo','max_duration_ms':dur,'seed':21,'actions':str(TMP/(name+'.actions.json')),'preview':str(TMP/(name+'.png')),'wav':str(ROOT/('assets/audio/'+name+'.wav'))})
    call('sfx-synth',cfg,'init')
    for i,(wave,freq,start,length,gain) in enumerate(voices):
        call('sfx-synth',cfg,'add-voice','--name',i,'--wave',wave,'--freq',freq,'--start',start,'--dur',length,'--gain',gain)
        call('sfx-synth',cfg,'set-envelope','--voice',i,'--env','pluck' if name!='death' else 'linear')
        if name=='death' and wave!='noise':call('sfx-synth',cfg,'set-pitch','--voice',i,'--slide-to',30,'--over',length)
    call('sfx-synth',cfg,'render')

cfg=config('music',{'sample_rate':44100,'channels':'stereo','max_duration_ms':10000,'seed':21,'instrument_bank':'synthwave','actions':str(TMP/'music.actions.json'),'preview':str(TMP/'music.png'),'wav':str(ROOT/'assets/audio/music.wav'),'mid':str(ROOT/'assets/audio/music.mid')})
call('music',cfg,'init');call('music',cfg,'set-tempo','--bpm',96)
for track,wave,gain,pan in [('bass','triangle',-25,0),('pulse','sine',-29,-0.3),('glint','triangle',-33,0.3)]:
    call('music',cfg,'define-track','--name',track,'--instrument',wave)
    call('music',cfg,'set-track-fx','--track',track,'--gain',gain,'--pan',pan,'--env','pluck')
for bar,root in enumerate([45,41,48,43]):
    for beat in range(4):
        call('music',cfg,'add-note','--track','bass','--pitch',root,'--t',bar*4+beat,'--dur',0.65,'--velocity',80)
    for step,interval in enumerate([12,19,24,19,12,19,22,19]):
        call('music',cfg,'add-note','--track','pulse','--pitch',root+interval,'--t',bar*4+step/2,'--dur',0.35,'--velocity',65)
    for step in [1,3]:call('music',cfg,'add-note','--track','glint','--pitch',root+31,'--t',bar*4+step+0.25,'--dur',0.3,'--velocity',55)
call('music',cfg,'render')
print('Produced seven sprites, three cues, and the music loop.')

# Master the loop to an exact sixteen-beat period and remove discontinuities.
import array
import wave
for name in ['eat','combo-up','death','music']:
    path=ROOT/('assets/audio/'+name+'.wav')
    with wave.open(str(path),'rb') as reader:
        params=reader.getparams();samples=array.array('h',reader.readframes(reader.getnframes()))
    frames=len(samples)//2
    for i in range(frames):
        envelope=min(1,i/132,(frames-1-i)/220)
        for channel in range(2):samples[2*i+channel]=round(samples[2*i+channel]*envelope*(2 if name=='music' else 1))
    if name=='music':samples.extend([0]*(44100*10*2-len(samples)))
    with wave.open(str(path),'wb') as writer:
        writer.setparams(params);writer.writeframes(samples.tobytes())
