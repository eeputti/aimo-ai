// Shorten only recorded waiting intervals; never replace model responses.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = path.resolve(process.argv[2] || 'deploy/selfhost-demo/.state/recording');
const report = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
if (report.passed !== true || report.realModel !== true) throw new Error('Esittelyvideo tarvitsee onnistuneen oikean mallikokeen.');
const m = report.marks;
const clips = [[0, m.firstSent + 2], [Math.max(0, m.firstReply - 0.2), m.updateSent + 2], [Math.max(0, m.updateReply - 0.2), m.end]];
if (clips.some(([start, end]) => !Number.isFinite(start) || !Number.isFinite(end) || end <= start)) throw new Error('Virheelliset tallenteen aikamerkit.');
const labelFile = path.join(dir, 'video-label.txt');
fs.writeFileSync(labelFile, `${report.model} · oikea malliajo · odotusajat lyhennetty`);
const escape = (v) => v.replace(/[\\':,;\[\]]/g, '\\$&');
const font = process.env.DEMO_FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const filter = clips.map(([s, e], i) => `[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[v${i}]`).join(';')
  + ';[v0][v1][v2]concat=n=3:v=1:a=0,drawbox=x=0:y=ih-48:w=iw:h=48:color=black@0.85:t=fill,'
  + `drawtext=fontfile='${escape(font)}':textfile='${escape(labelFile)}':x=24:y=h-34:fontsize=22:fontcolor=white[v]`;
const output = path.join(dir, 'aimo-demo.mp4');
const run = spawnSync(process.env.DEMO_FFMPEG || 'ffmpeg', ['-y','-i',path.join(dir,'raw.webm'),'-filter_complex',filter,
  '-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',output], { encoding:'utf8', timeout:180000 });
if (run.status !== 0) throw new Error(run.stderr?.slice(-1500) || 'Videon tekeminen epäonnistui.');
report.video = { file: 'aimo-demo.mp4', waitingIntervalsRemoved: true, clips, seconds: Number(clips.reduce((sum, [s,e]) => sum+e-s,0).toFixed(1)) };
fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ output, seconds: report.video.seconds, waitingIntervalsRemoved: true }));
