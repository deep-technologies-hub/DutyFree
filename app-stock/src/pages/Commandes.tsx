import { useState } from 'react';
import { useStockStore } from '../store/stockStore';
import { Plus, ShoppingCart, X, Package, Calendar, FileText } from 'lucide-react';
import type { Commande, LigneCommande, Fournisseur, Produit } from '../api';

const STATUTS_COMMANDE: Record<string, string> = {
  brouillon: 'Brouillon', envoyee: 'Envoyée', recue: 'Reçue', validee: 'Validée', annulee: 'Annulée',
};

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

interface NewOrderForm {
  fournisseur: string;
  date_attendue: string;
  notes: string;
  frais_approche: string;
  lignes: Array<{
    produit: string;
    quantite: string;
    prix_unitaire: string;
  }>;
}

interface ReceptionFormLigne {
  id: number;
  produit: number;
  produit_nom: string;
  quantite_commandee: number;
  quantite_recue: string;
  prix_unitaire: number;
  sommier_ref: string;
}

export default function Commandes() {
  const { orders, suppliers, products, updateOrder, addOrder, addMovement } = useStockStore();
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Commande | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<Commande | null>(null);
  const [receptionForm, setReceptionForm] = useState({
    frais_approche_reels: '',
    lignes: [] as ReceptionFormLigne[]
  });
  const [formData, setFormData] = useState<NewOrderForm>({
    fournisseur: '',
    date_attendue: '',
    notes: '',
    frais_approche: '',
    lignes: [{ produit: '', quantite: '', prix_unitaire: '' }]
  });

  const handleCreateOrder = () => {
    // Create new order logic
    const selectedSupplier = suppliers.find(s => s.id.toString() === formData.fournisseur);
    if (!selectedSupplier) return;

    const newOrder: Commande = {
      id: Date.now(),
      numero: `CMD-${Date.now()}`,
      fournisseur: selectedSupplier.id,
      fournisseur_nom: selectedSupplier.nom,
      statut: 'brouillon',
      devise: 'XOF',
      montant_total: 0,
      frais_approche: parseFloat(formData.frais_approche) || 0,
      notes: formData.notes,
      created_at: new Date().toISOString(),
      date_attendue: formData.date_attendue || null,
      lignes: formData.lignes
        .filter(ligne => ligne.produit && ligne.quantite && ligne.prix_unitaire)
        .map((ligne, index) => {
          const product = products.find(p => p.id.toString() === ligne.produit);
          return {
            id: index + 1,
            produit: parseInt(ligne.produit),
            produit_nom: product?.nom || '',
            quantite: parseInt(ligne.quantite),
            prix_unitaire: parseFloat(ligne.prix_unitaire),
            montant_total: parseInt(ligne.quantite) * parseFloat(ligne.prix_unitaire)
          };
        })
    };

    // Calculate total
    const totalMarchandises = newOrder.lignes.reduce((sum, ligne) => sum + ligne.montant_total, 0);
    newOrder.montant_total = totalMarchandises + newOrder.frais_approche;

    // Add order using store function
    addOrder(newOrder);

    // Reset form
    setFormData({
      fournisseur: '',
      date_attendue: '',
      notes: '',
      frais_approche: '',
      lignes: [{ produit: '', quantite: '', prix_unitaire: '' }]
    });
    setShowNewOrderModal(false);
  };

  const addLigne = () => {
    setFormData(prev => ({
      ...prev,
      lignes: [...prev.lignes, { produit: '', quantite: '', prix_unitaire: '' }]
    }));
  };

  const removeLigne = (index: number) => {
    setFormData(prev => ({
      ...prev,
      lignes: prev.lignes.filter((_, i) => i !== index)
    }));
  };

  const updateLigne = (index: number, field: keyof NewOrderForm['lignes'][0], value: string) => {
    setFormData(prev => ({
      ...prev,
      lignes: prev.lignes.map((ligne, i) =>
        i === index ? { ...ligne, [field]: value } : ligne
      )
    }));
  };

  const handleViewDetails = (order: Commande) => {
    setSelectedOrder(order);
    setShowDetailsModal(true);
  };

  const handleSendToSupplier = async (order: Commande) => {
    try {
      // Update order status to 'envoyee'
      updateOrder(order.id, { statut: 'envoyee' });

      // Generate PDF and send email
      const pdfBlob = await generateOrderPDF(order);
      await sendOrderEmail(order, pdfBlob);

      alert(`Commande ${order.numero} envoyée par email au fournisseur ${order.fournisseur_nom}`);
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la commande:', error);
      alert('Erreur lors de l\'envoi de l\'email. Veuillez réessayer.');
    }
  };

  const generateOrderPDF = async (order: Commande): Promise<Blob> => {
    // Create PDF content using jsPDF or similar library
    // For now, we'll create a simple text representation
    const pdfContent = `
BON DE COMMANDE
================

Numéro: ${order.numero}
Date: ${new Date(order.created_at).toLocaleDateString('fr-FR')}
Fournisseur: ${order.fournisseur_nom}
Date attendue: ${order.date_attendue ? new Date(order.date_attendue).toLocaleDateString('fr-FR') : 'Non spécifiée'}

PRODUITS COMMANDÉS:
==================

${order.lignes.map((ligne, index) => `
${index + 1}. ${ligne.produit_nom}
   Quantité: ${ligne.quantite}
   Prix unitaire: ${fmt(ligne.prix_unitaire)} XOF
   Total: ${fmt(ligne.quantite * ligne.prix_unitaire)} XOF
`).join('\n')}

TOTAL: ${fmt(order.montant_total)} XOF

${order.notes ? `\nNotes: ${order.notes}` : ''}
    `.trim();

    // Convert to blob (in real implementation, use a PDF library like jsPDF)
    return new Blob([pdfContent], { type: 'text/plain' });
  };

  const sendOrderEmail = async (order: Commande, pdfBlob: Blob) => {
    // Get supplier email
    const supplier = suppliers.find(s => s.id === order.fournisseur);
    if (!supplier || !supplier.email) {
      throw new Error('Email du fournisseur non trouvé');
    }

    // Create email data
    const emailData = {
      to: supplier.email,
      subject: `Bon de commande ${order.numero}`,
      body: `
Bonjour ${supplier.nom},

Veuillez trouver ci-joint notre bon de commande ${order.numero}.

Détails de la commande:
- Numéro: ${order.numero}
- Date: ${new Date(order.created_at).toLocaleDateString('fr-FR')}
- Montant total: ${fmt(order.montant_total)} XOF

Merci de confirmer la réception de cette commande et la date de livraison prévue.

Cordialement,
Service Achats
DutyFree
      `,
      attachment: {
        filename: `Commande_${order.numero}.pdf`,
        blob: pdfBlob
      }
    };

    // In a real implementation, this would call an email service API
    console.log('Email envoyé:', emailData);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    return true;
  };

  const handleOpenReceiveModal = (order: Commande) => {
    setReceivingOrder(order);
    setReceptionForm({
      frais_approche_reels: order.frais_approche.toString(),
      lignes: order.lignes.map(l => ({
        id: l.id,
        produit: l.produit,
        produit_nom: l.produit_nom,
        quantite_commandee: l.quantite,
        quantite_recue: l.quantite.toString(),
        prix_unitaire: l.prix_unitaire,
        sommier_ref: `SOM-${new Date().getFullYear()}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`
      }))
    });
  };

  const submitReception = async () => {
    if (!receivingOrder) return;
    
    const fraisReels = parseFloat(receptionForm.frais_approche_reels) || 0;
    const totalM = receptionForm.lignes.reduce((sum, l) => sum + (parseInt(l.quantite_recue||'0') * l.prix_unitaire), 0);
    
    // Create movements for received items
    for(const l of receptionForm.lignes) {
      const q = parseInt(l.quantite_recue || '0');
      if (q > 0) {
        const ligneAmount = q * l.prix_unitaire;
        const ratio = totalM > 0 ? (ligneAmount / totalM) : 0;
        const fraisLigne = fraisReels * ratio;
        const pnp = q > 0 ? (ligneAmount + fraisLigne) / q : 0;
        
        await addMovement({
          produit: l.produit,
          type_mouvement: 'entree',
          quantite: q,
          motif: `BRC CMD ${receivingOrder.numero} (PNP: ${fmt(pnp)} XOF)`,
          reference: l.sommier_ref
        });
      }
    }
    
    updateOrder(receivingOrder.id, { 
      statut: 'recue',
      frais_approche: fraisReels
    });
    
    setReceivingOrder(null);
    setShowDetailsModal(false);
    alert(`Bordereau de réception validé pour ${receivingOrder.numero}`);
  };

  const handleDownloadPDF = async (order: Commande) => {
    try {
      const pdfBlob = await generateOrderPDF(order);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Commande_${order.numero}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur lors du téléchargement du PDF:', error);
      alert('Erreur lors du téléchargement du fichier.');
    }
  };
  return (
    <div className="animate-in" style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div className="page-eyebrow">Approvisionnement</div>
          <h1 className="page-title">Commandes fournisseurs</h1>
          <p className="page-sub">Bons de commande et bordereaux de réception</p>
        </div>
        <button
          onClick={() => setShowNewOrderModal(true)}
          style={{ display: 'flex', alignItems: 'center', alignSelf: 'flex-end', gap: 6, background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 16px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          <Plus size={13} /> Nouvelle commande
        </button>
      </div>

      {/* New Order Modal */}
      {showNewOrderModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Nouvelle commande fournisseur</h2>
                <p className="page-sub">Créer un bon de commande</p>
              </div>
              <button
                onClick={() => setShowNewOrderModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                  Fournisseur *
                </label>
                <select
                  value={formData.fournisseur}
                  onChange={(e) => setFormData(prev => ({ ...prev, fournisseur: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    fontSize: 14
                  }}
                >
                  <option value="">Sélectionner un fournisseur</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                  Date attendue
                </label>
                <input
                  type="date"
                  value={formData.date_attendue}
                  onChange={(e) => setFormData(prev => ({ ...prev, date_attendue: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    fontSize: 14
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Produits commandés</label>
                <button
                  onClick={addLigne}
                  style={{
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Plus size={12} /> Ajouter une ligne
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {formData.lignes.map((ligne, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Produit</label>
                      <select
                        value={ligne.produit}
                        onChange={(e) => updateLigne(index, 'produit', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border-2)',
                          borderRadius: 6,
                          color: 'var(--text)',
                          fontSize: 13
                        }}
                      >
                        <option value="">Sélectionner un produit</option>
                        {products.map(product => (
                          <option key={product.id} value={product.id}>{product.nom}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Quantité</label>
                      <input
                        type="number"
                        value={ligne.quantite}
                        onChange={(e) => updateLigne(index, 'quantite', e.target.value)}
                        placeholder="Qté"
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border-2)',
                          borderRadius: 6,
                          color: 'var(--text)',
                          fontSize: 13
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Prix unitaire</label>
                      <input
                        type="number"
                        value={ligne.prix_unitaire}
                        onChange={(e) => updateLigne(index, 'prix_unitaire', e.target.value)}
                        placeholder="Prix"
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border-2)',
                          borderRadius: 6,
                          color: 'var(--text)',
                          fontSize: 13
                        }}
                      />
                    </div>
                    {formData.lignes.length > 1 && (
                      <button
                        onClick={() => removeLigne(index)}
                        style={{
                          background: 'var(--c-down)',
                          border: 'none',
                          borderRadius: 6,
                          padding: '8px',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                  Frais d'approche prévus (XOF)
                </label>
                <input
                  type="number"
                  value={formData.frais_approche}
                  onChange={(e) => setFormData(prev => ({ ...prev, frais_approche: e.target.value }))}
                  placeholder="Ex: 45000"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    fontSize: 14
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Instructions spéciales..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setShowNewOrderModal(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-2)',
                  borderRadius: 6,
                  padding: '10px 20px',
                  color: 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCreateOrder}
                disabled={!formData.fournisseur || formData.lignes.every(l => !l.produit || !l.quantite || !l.prix_unitaire)}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 20px',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: (!formData.fournisseur || formData.lignes.every(l => !l.produit || !l.quantite || !l.prix_unitaire)) ? 0.5 : 1
                }}
              >
                Créer la commande
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {orders.map(o => (
          <div key={o.id} className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{o.fournisseur_nom}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: 'IBM Plex Mono, monospace' }}>{o.numero || `#${o.id}`} · {new Date(o.created_at).toLocaleDateString('fr-FR')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge ${o.statut === 'validee' ? 'badge-ok' : o.statut === 'envoyee' ? 'badge-warn' : o.statut === 'recue' ? 'badge-info' : 'badge-info'}`}>{STATUTS_COMMANDE[o.statut] ?? o.statut}</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace', marginTop: 6 }}>{fmt(o.montant_total)} {o.devise}</div>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--surface-2)' }}>
                  {['Produit', 'Qté', 'Prix unit.', 'Total'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {o.lignes.map((item, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px 0', color: 'var(--text)' }}>{item.produit_nom}</td>
                    <td style={{ padding: '8px 0', color: 'var(--text-2)', fontFamily: 'IBM Plex Mono, monospace' }}>{item.quantite}</td>
                    <td style={{ padding: '8px 0', color: 'var(--text-2)', fontFamily: 'IBM Plex Mono, monospace' }}>{fmt(item.prix_unitaire)}</td>
                    <td style={{ padding: '8px 0', color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600 }}>{fmt(item.quantite * item.prix_unitaire)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {o.notes && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--accent-dim)', borderRadius: 6, fontSize: 11, color: 'var(--accent)' }}>
                📝 {o.notes}
              </div>
            )}
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {o.statut === 'brouillon' && (
                <button
                  onClick={() => handleSendToSupplier(o)}
                  style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '7px 14px', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  Envoyer au fournisseur
                </button>
              )}
              {o.statut === 'envoyee' && (
                <button
                  onClick={() => handleOpenReceiveModal(o)}
                  style={{ background: 'var(--c-up)', border: 'none', borderRadius: 6, padding: '7px 14px', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  Enregistrer réception
                </button>
              )}
              <button
                onClick={() => handleViewDetails(o)}
                style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 6, padding: '7px 14px', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer' }}
              >
                Voir détails
              </button>
              <button
                onClick={() => handleDownloadPDF(o)}
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '7px 14px', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer' }}
                title="Télécharger le bon de commande"
              >
                📄 Télécharger
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Order Details Modal */}
      {showDetailsModal && selectedOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Détails de la commande</h2>
                <p className="page-sub">{selectedOrder.numero}</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Fournisseur</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{selectedOrder.fournisseur_nom}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Statut</div>
                <span className={`badge ${selectedOrder.statut === 'validee' ? 'badge-ok' : selectedOrder.statut === 'envoyee' ? 'badge-warn' : selectedOrder.statut === 'recue' ? 'badge-info' : 'badge-info'}`}>
                  {selectedOrder.statut}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Date de création</div>
                <div style={{ fontSize: 14, color: 'var(--text)' }}>{new Date(selectedOrder.created_at).toLocaleDateString('fr-FR')}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Date attendue</div>
                <div style={{ fontSize: 14, color: 'var(--text)' }}>
                  {selectedOrder.date_attendue ? new Date(selectedOrder.date_attendue).toLocaleDateString('fr-FR') : 'Non spécifiée'}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Produits commandés</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 0', color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>Produit</th>
                    <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>Quantité</th>
                    <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>Prix unitaire</th>
                    <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.lignes.map((item, i) => (
                    <tr key={i}>
                      <td style={{ padding: '12px 0', color: 'var(--text)' }}>{item.produit_nom}</td>
                      <td style={{ padding: '12px 0', color: 'var(--text-2)', fontFamily: 'IBM Plex Mono, monospace', textAlign: 'right' }}>{item.quantite}</td>
                      <td style={{ padding: '12px 0', color: 'var(--text-2)', fontFamily: 'IBM Plex Mono, monospace', textAlign: 'right' }}>{fmt(item.prix_unitaire)}</td>
                      <td style={{ padding: '12px 0', color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, textAlign: 'right' }}>
                        {fmt(item.quantite * item.prix_unitaire)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--surface-2)' }}>
                    <td colSpan={3} style={{ padding: '12px 0', color: 'var(--text)', fontWeight: 600, textAlign: 'right' }}>Total</td>
                    <td style={{ padding: '12px 0', color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 14, textAlign: 'right' }}>
                      {fmt(selectedOrder.montant_total)} {selectedOrder.devise}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {selectedOrder.notes && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Notes</h3>
                <div style={{ padding: '12px', background: 'var(--accent-dim)', borderRadius: 6, fontSize: 12, color: 'var(--accent)' }}>
                  📝 {selectedOrder.notes}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              {selectedOrder.statut === 'brouillon' && (
                <button
                  onClick={() => {
                    handleSendToSupplier(selectedOrder);
                    setShowDetailsModal(false);
                  }}
                  style={{
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 6,
                    padding: '10px 20px',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Envoyer au fournisseur
                </button>
              )}
              {selectedOrder.statut === 'envoyee' && (
                <button
                  onClick={() => {
                    handleOpenReceiveModal(selectedOrder);
                  }}
                  style={{
                    background: 'var(--c-up)',
                    border: 'none',
                    borderRadius: 6,
                    padding: '10px 20px',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Enregistrer réception
                </button>
              )}
              <button
                onClick={() => handleDownloadPDF(selectedOrder)}
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-2)',
                  borderRadius: 6,
                  padding: '10px 20px',
                  color: 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                📄 Télécharger PDF
              </button>
              <button
                onClick={() => setShowDetailsModal(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-2)',
                  borderRadius: 6,
                  padding: '10px 20px',
                  color: 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Reception Modal */}
      {receivingOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottom: '1px solid var(--border-2)', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Bordereau de Réception</h2>
                <p className="page-sub">Commande {receivingOrder.numero}</p>
              </div>
              <button
                onClick={() => setReceivingOrder(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: 24, overflow: 'auto', flex: 1 }}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                  Frais d'approche réels (XOF)
                </label>
                <input
                  type="number"
                  value={receptionForm.frais_approche_reels}
                  onChange={(e) => setReceptionForm(prev => ({ ...prev, frais_approche_reels: e.target.value }))}
                  placeholder="Ajuster si différent des prévus..."
                  style={{
                    width: '100%',
                    maxWidth: 300,
                    padding: '10px 12px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    fontSize: 14
                  }}
                />
              </div>

              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Marchandises reçues</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {receptionForm.lignes.map((ligne, index) => {
                  const totalM = receptionForm.lignes.reduce((sum, l) => sum + (parseInt(l.quantite_recue||'0') * l.prix_unitaire), 0);
                  const fraisReels = parseFloat(receptionForm.frais_approche_reels) || 0;
                  const q = parseInt(ligne.quantite_recue || '0');
                  const ligneAmount = q * ligne.prix_unitaire;
                  const ratio = totalM > 0 ? (ligneAmount / totalM) : 0;
                  const fraisLigne = fraisReels * ratio;
                  const pnp = q > 0 ? (ligneAmount + fraisLigne) / q : 0;
                  
                  return (
                  <div key={index} style={{ padding: 16, background: 'var(--surface-1)', borderRadius: 8, border: '1px solid var(--border-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{ligne.produit_nom}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Commandé: <strong style={{ color: 'var(--text)' }}>{ligne.quantite_commandee}</strong></div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) minmax(130px, 1fr) minmax(180px, 2fr)', gap: 12, alignItems: 'end' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Qté Reçue</label>
                        <input
                          type="number"
                          value={ligne.quantite_recue}
                          onChange={(e) => {
                            const newLignes = [...receptionForm.lignes];
                            newLignes[index].quantite_recue = e.target.value;
                            setReceptionForm({ ...receptionForm, lignes: newLignes });
                          }}
                          style={{ width: '100%', padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Sommier DJBC</label>
                        <input
                          type="text"
                          value={ligne.sommier_ref}
                          onChange={(e) => {
                            const newLignes = [...receptionForm.lignes];
                            newLignes[index].sommier_ref = e.target.value;
                            setReceptionForm({ ...receptionForm, lignes: newLignes });
                          }}
                          placeholder="SOM-..."
                          title="Référence Sommier Douanier"
                          style={{ width: '100%', padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>PNP Estimé</div>
                        <div style={{ padding: '8px 10px', background: 'transparent', color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', height: 35 }}>
                          {fmt(pnp)} XOF / {q>0 ? 'unité' : '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            </div>
            
            <div style={{ padding: 24, borderTop: '1px solid var(--border-2)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setReceivingOrder(null)}
                style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 6, padding: '10px 20px', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                Annuler
              </button>
              <button
                onClick={submitReception}
                style={{ background: 'var(--c-up)', border: 'none', borderRadius: 6, padding: '10px 20px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Valider la réception
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
