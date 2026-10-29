import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBackofficeStore } from '../store/backofficeStore';
import { tenantStorage } from '../api';
import { Eye, EyeOff, AlertTriangle, BarChart3 } from 'lucide-react';

export default function LoginPage() {
  const { login, authLoading: isLoading, authError: error } = useBackofficeStore();
  const [organisation, setOrganisation] = useState(tenantStorage.get());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [tick, setTick] = useState(new Date());
  useEffect(()=>{ const t=setInterval(()=>setTick(new Date()),1000); return ()=>clearInterval(t); },[]);

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',overflow:'hidden'}}>
      {/* Colonne gauche — branding */}
      <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:'44px 52px',borderRight:'1px solid var(--border)',position:'relative',overflow:'hidden'}}>
        {/* Accent vertical très subtil */}
        <div style={{position:'absolute',left:0,top:'20%',bottom:'20%',width:1,background:'linear-gradient(180deg,transparent,var(--accent),transparent)',opacity:0.3}}/>

        {/* Logo */}
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,background:'var(--accent)',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <BarChart3 size={16} color="#fff" strokeWidth={2.5}/>
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:13.5,color:'var(--text)'}}>Duty Free Manager</div>
            <div style={{fontSize:9,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.18em'}}>Backoffice</div>
          </div>
        </div>

        {/* Titre principal */}
        <div>
          <div style={{fontSize:10,fontWeight:600,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.2em',marginBottom:14}}>
            Logiciel de gestion en ligne
          </div>
          <h1 style={{fontFamily: 'IBM Plex Sans, system-ui, sans-serif',fontSize:46,fontWeight: 700,color:'var(--text)',lineHeight:1.12,letterSpacing:'-0.02em',marginBottom:18}}>
            Votre boutique<br/>
            <em style={{color:'var(--accent)',fontStyle: 'normal'}}>Duty Free</em><br/>
            dans le cloud
          </h1>
          <p style={{fontSize:13,color:'var(--text-3)',lineHeight:1.65,maxWidth:360}}>
            Ventes multi-devises, stock en temps réel, sommiers douaniers et programme fidélité — accessibles partout, sans installation.
          </p>
        </div>

        {/* Horloge */}
        <div>
          <div style={{fontFamily:'IBM Plex Mono,monospace',fontSize:26,fontWeight:400,color:'var(--text-2)',letterSpacing:'0.04em',marginBottom:4}}>
            {tick.toLocaleTimeString('fr-FR')}
          </div>
          <div style={{fontSize:11,color:'var(--text-3)'}}>
            {tick.toLocaleDateString('fr-FR',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
          </div>
        </div>
      </div>

      {/* Colonne droite — formulaire */}
      <div style={{width:440,display:'flex',flexDirection:'column',justifyContent:'center',padding:'44px 52px'}}>
        <div style={{marginBottom:36}}>
          <div className="section-label" style={{marginBottom:7}}>Connexion</div>
          <h2 style={{fontSize:22,fontWeight:700,color:'var(--text)',letterSpacing:'-0.01em'}}>Accès backoffice</h2>
        </div>

        {error&&<div className="alert alert-red" style={{marginBottom:18}}>
          <AlertTriangle size={13} style={{flexShrink:0}}/><span>{error}</span>
        </div>}

        <form onSubmit={async e=>{e.preventDefault();tenantStorage.set(organisation);await login(username,password);}} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <label className="label-xs" style={{display:'block',marginBottom:6}}>Code entreprise</label>
            <input type="text" value={organisation} onChange={e=>setOrganisation(e.target.value)} placeholder="ex : ma-boutique" autoComplete="organization" autoFocus={!organisation}/>
          </div>
          <div>
            <label className="label-xs" style={{display:'block',marginBottom:6}}>Identifiant</label>
            <input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Nom d'utilisateur" autoFocus={!!organisation} autoComplete="username"/>
          </div>
          <div>
            <label className="label-xs" style={{display:'block',marginBottom:6}}>Mot de passe</label>
            <div style={{position:'relative'}}>
              <input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" style={{paddingRight:38}}/>
              <button type="button" onClick={()=>setShow(p=>!p)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',padding:2}}>
                {show?<EyeOff size={14}/>:<Eye size={14}/>}
              </button>
            </div>
          </div>
          <button type="submit" disabled={isLoading||!organisation||!username||!password} className="btn btn-primary btn-lg" style={{marginTop:6,justifyContent:'center',width:'100%'}}>
            {isLoading?'Connexion…':'Se connecter'}
          </button>
          <Link to="/mot-de-passe-oublie" style={{fontSize:12,color:'var(--text-3)',textAlign:'center'}}>Mot de passe oublié ?</Link>
        </form>

        <div style={{marginTop:48,paddingTop:20,borderTop:'1px solid var(--border)'}}>
          <p style={{fontSize:12,color:'var(--text-2)',lineHeight:1.6,marginBottom:6}}>
            Pas encore de compte ? <Link to="/inscription" style={{color:'var(--accent)',fontWeight:600}}>Créer mon espace (essai gratuit)</Link>
          </p>
          <p style={{fontSize:11,color:'var(--text-3)',lineHeight:1.6}}>
            Le code entreprise vous a été communiqué à l'inscription.
          </p>
        </div>
      </div>
    </div>
  );
}
