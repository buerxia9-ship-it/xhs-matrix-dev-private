from pathlib import Path
import os,sys,subprocess,shutil,json,socket,time,urllib.request,datetime
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'.cloud-data'
META=BASE/'processes'
MODES={'readonly':(4181,'cloud/start.cjs','/api/v1/health'),'sandbox':(4182,'cloud/sandbox/server.cjs','/api/sandbox/health')}
def process_info(pid):
 script="[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-CimInstance Win32_Process -Filter 'ProcessId = "+str(int(pid))+"' | Select-Object ProcessId,ExecutablePath,CommandLine,@{Name='Created';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress"
 r=subprocess.run(['powershell','-NoProfile','-Command',script],capture_output=True,encoding='utf-8',errors='replace')
 return json.loads(r.stdout) if r.stdout.strip() else None
def verify(record,mode):
 info=process_info(record['pid']);entry=str(ROOT/MODES[mode][1])
 if not info:return None
 if entry not in info.get('CommandLine','') or Path(info['ExecutablePath']).name.lower()!='node.exe':raise RuntimeError('Refusing unrelated/reused PID')
 if record.get('created') and info['Created']!=record['created']:raise RuntimeError('PID creation time changed')
 return info
def health(mode):
 port,_,url=MODES[mode]
 with urllib.request.urlopen('http://127.0.0.1:'+str(port)+url,timeout=2) as r:
  data=json.load(r)
  if r.status!=200 or data.get('status')!='ok' or (mode=='readonly' and data.get('db')!='ok') or (mode=='sandbox' and data.get('mode')!='offline-mock'):raise RuntimeError('Unexpected preview health')
def safe_environment(node,mode):
 for p in [BASE,*BASE.parents]:
  if p.exists() and (p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction())):raise RuntimeError('Reparse path refused')
 e={k:os.environ[k] for k in ['SystemRoot','WINDIR','COMSPEC','PATHEXT'] if k in os.environ}
 home=BASE/'home';temp=BASE/'temp'
 for folder in [home,home/'appdata',home/'localappdata',temp]:folder.mkdir(parents=True,exist_ok=True)
 data=BASE if mode=='readonly' else BASE/'sandbox'
 e.update({'PATH':os.pathsep.join([str(Path(node).parent),r'C:\Windows\System32',r'C:\Windows\System32\WindowsPowerShell\v1.0']),'HOME':str(home),'USERPROFILE':str(home),'APPDATA':str(home/'appdata'),'LOCALAPPDATA':str(home/'localappdata'),'TEMP':str(temp),'TMP':str(temp),'CLOUD_TEST_MODE':'1','SYNTHETIC_SANDBOX':'1' if mode=='sandbox' else '0','LAN_ACCESS':'0','PORT':str(MODES[mode][0]),'DATA_DIR':str(data),'DATABASE_URL':'file:'+str(data/'fixture.db').replace('\\','/'),'ENCRYPTION_KEY':'synthetic-local-test-value-only'})
 return e
def start(mode):
 META.mkdir(parents=True,exist_ok=True);recordfile=META/(mode+'.json')
 if recordfile.exists():
  old=json.loads(recordfile.read_text(encoding='utf-8'))
  if verify(old,mode):health(mode);return {**old,'alreadyRunning':True}
 port,script,_=MODES[mode];sock=socket.socket();sock.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1);sock.bind(('127.0.0.1',port));sock.close()
 node=shutil.which('node')
 if not node or subprocess.check_output([node,'--version']).decode().strip()!='v24.22.1':raise RuntimeError('Node 24.22.1 required')
 if mode=='readonly' and not (BASE/'fixture.db').exists():raise RuntimeError('Build and create the approved synthetic fixture first')
 env=safe_environment(node,mode);logs=BASE/'logs';logs.mkdir(exist_ok=True)
 stamp=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime('%Y%m%d-%H%M%S-%f')
 out=logs/(mode+'-'+stamp+'.stdout.txt');err=logs/(mode+'-'+stamp+'.stderr.txt')
 with out.open('wb') as stdout,err.open('wb') as stderr:
  p=subprocess.Popen([node,str(ROOT/script)],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,creationflags=subprocess.CREATE_NO_WINDOW|subprocess.CREATE_NEW_PROCESS_GROUP)
 record={'mode':mode,'pid':p.pid,'port':port,'url':'http://127.0.0.1:'+str(port),'entrypoint':str(ROOT/script),'database':str(BASE/('fixture.db' if mode=='readonly' else 'sandbox/fixture.db')),'stdoutLog':str(out),'stderrLog':str(err),'startedAt':stamp}
 for _ in range(30):
  if p.poll() is not None:raise RuntimeError('Preview exited '+str(p.returncode)+'; see '+str(err))
  try:health(mode);break
  except Exception:time.sleep(.2)
 else:raise RuntimeError('No healthy preview response; see '+str(err))
 info=process_info(p.pid);record['created']=info['Created'];recordfile.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8');return record
def stop(mode):
 file=META/(mode+'.json')
 if not file.exists():return {'mode':mode,'status':'not_managed_no_action'}
 record=json.loads(file.read_text(encoding='utf-8'));info=verify(record,mode)
 if not info:return {'mode':mode,'status':'already_stopped','pid':record['pid']}
 subprocess.run(['powershell','-NoProfile','-Command','Stop-Process -Id '+str(int(record['pid']))],check=True,capture_output=True)
 for _ in range(20):
  s=socket.socket();status=s.connect_ex(('127.0.0.1',MODES[mode][0]));s.close()
  if status!=0:return {'mode':mode,'status':'stopped','pid':record['pid']}
  time.sleep(.1)
 raise RuntimeError('Port still open; no unrelated process was killed')
if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf-8')
 if os.name!='nt':raise SystemExit('This launcher is specifically for Windows')
 operation=sys.argv[1] if len(sys.argv)>1 else 'start';choice=sys.argv[2] if len(sys.argv)>2 else 'both'
 if operation not in ['start','stop'] or choice not in [*MODES,'both']:raise SystemExit('Usage: python cloud/preview-windows.py start|stop [readonly|sandbox|both]')
 result=[]
 for mode in list(MODES) if choice=='both' else [choice]:result.append(start(mode) if operation=='start' else stop(mode))
 print(json.dumps(result,ensure_ascii=False))
