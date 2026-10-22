import { useStockStore } from '../store/stockStore';
import { AlertTriangle, TrendingDown, Package, FileText, ArrowUpRight, ArrowDownRight, RefreshCw, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const G = ['#EA580C', '#14B8A6', '#F59E0B', '#3B82F6', '#8B5CF6', '#E53E3E'];

function CT({active,payload,label}:any) {
  if(!active||!payload?.length) return null;
  return <div style={{background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:5,padding:'8px 12px',fontSize:12}}>
    {label&&<div style={{color:'var(--text-3)',fontSize:10,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}</div>}
    {payload.map((p:any)=><div key={p.name} style={{fontFamily:'IBM Plex Mono,monospace',color:'var(--text)'}}>{fmt(p.value)}</div>)}
  </div>;
}

function KpiCard({icon,label,value,sub,color,alert=false}:{icon:React.ReactNode;label:string;value:number|string;sub:string;color:string;alert?:boolean}) {
  return (
    <div className="card" style={{padding:'16px 18px',position:'relative',overflow:'hidden'}}>
      {alert&&Number(value)>0&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${color},transparent)`}}/>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
        <div style={{color,background:color+'14',padding:7,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center'}}>{icon}</div>
        <span style={{fontFamily:'IBM Plex Mono,monospace',fontSize:26,fontWeight:600,color:alert&&Number(value)>0?color:'var(--text)'}}>{value}</span>
      </div>
      <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:2}}>{label}</div>
      <div style={{fontSize:11,color:'var(--text-3)'}}>{sub}</div>
    </div>
  );
}

export default function Dashboard() {
  const { products, sommiers, movements, orders, fetchProducts } = useStockStore();
  const ruptures = products.filter(p=>p.statut_stock==='rupture').length;
  const critiques = products.filter(p=>p.statut_stock==='critique').length;
  const bas = products.filter(p=>p.statut_stock==='bas').length;
  const sommiersActifs = sommiers.filter(s=>s.statut==='actif').length;
  const sommiersApurement = sommiers.filter(s=>s.statut==='en_cours').length;
  const cmdEnAttente = orders.filter(o=>o.statut==='envoyee').length;
  
  const valeurStock = products.reduce((acc, p) => acc + (Math.max(0, p.stock) * p.prix_xof), 0);

  const categoryData = ['Alcools','Parfums','Tabac','Cosmétiques','Confiserie','Accessoires'].map(cat=>({
    name:cat.substring(0,6),
    stock:products.filter(p=>p.categorie===cat.toLowerCase()||(cat==='Cosmétiques'&&p.categorie==='cosmetiques')).reduce((a,p)=>a+Math.max(0, p.stock),0),
  }));

  const recentMvts = movements.slice(0,6);

  return (
    <div className="animate-in" style={{padding:'26px 28px',maxWidth:1440,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:22}}>
        <div>
          <div className="section-label" style={{marginBottom:4}}>Stock</div>
          <h1 style={{fontFamily:'Playfair Display,Georgia,serif',fontSize:24,fontWeight:500,color:'var(--text)',letterSpacing:'-0.01em'}}>Tableau de bord</h1>
        </div>
        <button className="btn btn-ghost btn-sm" style={{gap:6}} onClick={()=>fetchProducts()}>
          <RefreshCw size={12}/> Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:18}}>
        <KpiCard icon={<Package size={16}/>} label="Produits"  value={products.length}        sub="référencés"              color="#3D75C4"/>
        <KpiCard icon={<TrendingUp size={16}/>} label="Valeur stock" value={`${fmt(valeurStock)} F`} sub="valorisation globale"     color="#7A5FC4"/>
        <KpiCard icon={<AlertTriangle size={16}/>} label="Ruptures" value={ruptures+critiques}      sub={`${ruptures} rupture · ${critiques} crit.`} color="#C9524A" alert/>
        <KpiCard icon={<TrendingDown size={16}/>} label="Stock bas"  value={bas}                    sub="sous seuil minimum"                color="#C47B35"/>
        <KpiCard icon={<FileText size={16}/>} label="Sommiers"       value={sommiersActifs}         sub={`${sommiersApurement} à apurer`} color="#2EAD78"/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
        {/* Chart stock par catégorie */}
        <div className="card" style={{padding:'16px 18px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
            <span className="section-label">Stock par catégorie</span>
            <div style={{flex:1,height:1,background:'var(--border)'}}/>
          </div>
          <ResponsiveContainer width="100%" height={185}>
            <BarChart data={categoryData} barSize={22} margin={{top:2,right:2,bottom:0,left:-18}}>
              <XAxis dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip content={<CT/>} cursor={{fill:'rgba(234,88,12,0.04)'}}/>
              <Bar dataKey="stock" radius={[3,3,0,0]}>
                {categoryData.map((_,i)=><Cell key={i} fill={G[i%G.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Alertes prioritaires */}
        <div className="card" style={{padding:'16px 18px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
            <span className="section-label">Alertes prioritaires</span>
            <div style={{flex:1,height:1,background:'var(--border)'}}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {products.filter(p=>p.statut_stock!=='ok').slice(0,5).map(p=>(
              <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 12px',background:'var(--surface-2)',borderRadius:6,border:`1px solid ${p.statut_stock==='rupture'?'var(--c-down-bd)':p.statut_stock==='critique'?'var(--c-down-bd)':'var(--c-warn-bd)'}`}}>
                <div>
                  <div style={{fontSize:12,fontWeight:500,color:'var(--text)'}}>{p.nom}</div>
                  <div style={{fontSize:10,color:'var(--text-3)'}}>{p.categorie}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <span className={`badge ${p.statut_stock==='rupture'?'badge-danger':p.statut_stock==='critique'?'badge-danger':'badge-amber'}`}>
                    {p.statut_stock==='rupture'?'Rupture':p.statut_stock==='critique'?'Critique':'Bas'}
                  </span>
                  <div style={{fontSize:10,color:'var(--text-3)',marginTop:2,fontFamily:'IBM Plex Mono,monospace'}}>{p.stock} {p.unite}</div>
                </div>
              </div>
            ))}
            {products.filter(p=>p.statut_stock!=='ok').length===0&&(
              <div className="empty-state" style={{padding:'24px'}}>✓ Aucune alerte active</div>
            )}
          </div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:8}}>
        {/* Mouvements récents */}
        <div className="card" style={{padding:'16px 18px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
            <span className="section-label">Derniers mouvements</span>
            <div style={{flex:1,height:1,background:'var(--border)'}}/>
          </div>
          <table className="data-table">
            <thead><tr>
              {['Produit','Type','Qté','Date','Par'].map(h=><th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {recentMvts.map(m=>(
                <tr key={m.id}>
                  <td style={{color:'var(--text)',fontWeight:500}}>{m.produit_nom}</td>
                  <td>
                    <span className={`badge ${m.type_mouvement==='entree'?'badge-green':m.type_mouvement==='sortie'?'badge-blue':'badge-amber'}`}>
                      {m.type_mouvement==='entree'?'Entrée':m.type_mouvement==='sortie'?'Sortie':'Ajust.'}
                    </span>
                  </td>
                  <td>
                    <span style={{display:'flex',alignItems:'center',gap:3,color:m.type_mouvement==='entree'?'var(--c-up)':'var(--c-down)',fontFamily:'IBM Plex Mono,monospace',fontWeight:500,fontSize:13}}>
                      {m.type_mouvement==='entree'?<ArrowUpRight size={12}/>:<ArrowDownRight size={12}/>}
                      {Math.abs(m.quantite)}
                    </span>
                  </td>
                  <td style={{fontFamily:'IBM Plex Mono,monospace',fontSize:11}}>{new Date(m.date).toLocaleDateString('fr-FR')}</td>
                  <td>{m.utilisateur_nom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Commandes fournisseurs */}
        <div className="card" style={{padding:'16px 18px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
            <span className="section-label">Commandes fournisseurs</span>
            {cmdEnAttente>0&&<span className="badge badge-amber">{cmdEnAttente}</span>}
            <div style={{flex:1,height:1,background:'var(--border)'}}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            {orders.map(o=>(
              <div key={o.id} style={{padding:'10px 12px',background:'var(--surface-2)',borderRadius:6,border:'1px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                  <span style={{fontSize:12,fontWeight:500,color:'var(--text)'}}>{o.fournisseur_nom}</span>
                  <span className={`badge ${o.statut==='envoyee'?'badge-amber':o.statut==='validee'?'badge-green':'badge-blue'}`}>{o.statut}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-3)'}}>
                  <span>{o.lignes.length} article{o.lignes.length>1?'s':''}</span>
                  <span style={{color:'var(--accent)',fontFamily:'IBM Plex Mono,monospace',fontWeight:500}}>{fmt(o.montant_total)} XOF</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
