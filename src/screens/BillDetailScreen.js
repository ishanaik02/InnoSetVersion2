import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { getBillById, submitBill, approveBill, rejectBill, markBillPaid, getBillPrint } from '../services/billService';
import RNPrint from 'react-native-print';


const STATUS_CONFIG = {
  draft:           { label: 'Draft',            color: colors.textMuted  },
  submitted:       { label: 'Awaiting BM',       color: colors.warning    },
  approved_by_bm:  { label: 'Awaiting HR',       color: '#6C63FF'         },
  approved_by_hr:  { label: 'Awaiting SH',       color: colors.primary    },
  approved_by_sh:  { label: 'Awaiting Accounts', color: '#00A878'         },
  approved:        { label: 'Approved',           color: colors.success    },
  rejected:        { label: 'Rejected',           color: colors.danger     },
  paid:            { label: 'Paid ✓',             color: '#1A7A4A'         },
};

const APPROVAL_STAGES = [
  { status: 'submitted',       label: 'Engineer Submitted',   role: 'service_engineer' },
  { status: 'approved_by_bm',  label: 'Branch Manager',       role: 'branch_manager'   },
  { status: 'approved_by_hr',  label: 'HR Department',        role: 'hr'               },
  { status: 'approved_by_sh',  label: 'Service Head',         role: 'service_head'     },
  { status: 'approved',        label: 'Account Dept',         role: 'account_dept'     },
];

function ApprovalTimeline({ bill }) {
  const currentIdx = APPROVAL_STAGES.findIndex(s => s.status === bill.status);
  return (
    <View style={styles.timeline}>
      {APPROVAL_STAGES.map((stage, i) => {
        const done = i < currentIdx || bill.status === 'paid';
        const active = i === currentIdx;
        const rejected = bill.status === 'rejected';
        return (
          <View key={stage.status} style={styles.timelineRow}>
            <View style={[
              styles.timelineDot,
              done && { backgroundColor: colors.success },
              active && !rejected && { backgroundColor: colors.primary },
              active && rejected && { backgroundColor: colors.danger },
            ]}>
              <Text style={styles.timelineDotText}>{done ? '✓' : i + 1}</Text>
            </View>
            <View style={styles.timelineContent}>
              <Text style={[styles.stageLabel, (done || active) && { color: colors.text }]}>
                {stage.label}
              </Text>
            </View>
            {i < APPROVAL_STAGES.length - 1 && (
              <View style={[styles.timelineLine, done && { backgroundColor: colors.success }]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function HistoryItem({ item }) {
  const actionColors = { submitted: colors.primary, approved: colors.success, rejected: colors.danger, edited: colors.warning };
  const ts = item.timestamp ? new Date(item.timestamp).toLocaleString('en-IN') : '';
  return (
    <View style={styles.historyItem}>
      <View style={[styles.historyDot, { backgroundColor: actionColors[item.action] || colors.textMuted }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.historyAction}>
          <Text style={{ color: actionColors[item.action], fontWeight: '700' }}>{item.action?.toUpperCase()}</Text>
          {' by '}{item.approverName || 'Unknown'} ({item.approverRole})
        </Text>
        {item.remarks ? <Text style={styles.historyRemarks}>"{item.remarks}"</Text> : null}
        <Text style={styles.historyTime}>{ts}</Text>
      </View>
    </View>
  );
}

function buildPrintHTML(data) {
  const emp = data.employee || {};
  const branch = data.branch || {};
  const trip = data.trip || {};
  const amounts = data.amounts || {};
  const history = data.approvalHistory || [];

  const historyRows = history.map(h =>
    `<tr>
      <td>${h.action?.toUpperCase() || ''}</td>
      <td>${h.approver || '—'}</td>
      <td>${h.role || '—'}</td>
      <td>${h.remarks || '—'}</td>
      <td>${h.timestamp || '—'}</td>
    </tr>`
  ).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TA/DA Bill - ${data.billNumber || ''}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; padding: 24px; font-size: 13px; }
    .header { text-align: center; border-bottom: 3px solid #0F4C81; padding-bottom: 16px; margin-bottom: 20px; }
    .header h1 { font-size: 22px; color: #0F4C81; margin-bottom: 4px; }
    .header h2 { font-size: 14px; color: #555; font-weight: 500; }
    .bill-meta { display: flex; justify-content: space-between; margin-bottom: 16px; }
    .bill-meta .left, .bill-meta .right { width: 48%; }
    .bill-meta .label { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .bill-meta .value { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 14px; font-weight: 700; color: #0F4C81; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    table th, table td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 12px; }
    table th { background-color: #f0f4f8; font-weight: 700; color: #333; }
    .amount-table td:last-child { text-align: right; font-weight: 600; }
    .total-row { background-color: #e8f4e8; font-weight: 800; }
    .total-row td { font-size: 14px; }
    .approved-row { background-color: #d4edda; }
    .status-badge { display: inline-block; padding: 3px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; color: white; }
    .status-approved { background-color: #28a745; }
    .status-paid { background-color: #1A7A4A; }
    .status-rejected { background-color: #dc3545; }
    .status-default { background-color: #6c757d; }
    .signatures { display: flex; justify-content: space-between; margin-top: 48px; }
    .sig-box { text-align: center; width: 30%; }
    .sig-line { border-top: 1px solid #333; margin-top: 48px; padding-top: 6px; font-size: 11px; color: #555; }
    .footer { text-align: center; margin-top: 24px; color: #999; font-size: 10px; border-top: 1px solid #eee; padding-top: 12px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>INNOSET — TA/DA Bill</h1>
    <h2>${branch.name || 'Branch'} ${branch.code ? '(' + branch.code + ')' : ''}</h2>
  </div>

  <div class="bill-meta">
    <div class="left">
      <div class="label">Bill Number</div>
      <div class="value">${data.billNumber || '—'}</div>
      <div class="label">Issue Date</div>
      <div class="value">${data.issueDate || '—'}</div>
      <div class="label">Status</div>
      <div class="value">
        <span class="status-badge ${data.status === 'approved' ? 'status-approved' : data.status === 'paid' ? 'status-paid' : data.status === 'rejected' ? 'status-rejected' : 'status-default'}">
          ${(data.status || '').toUpperCase().replace(/_/g, ' ')}
        </span>
      </div>
    </div>
    <div class="right">
      <div class="label">Employee Name</div>
      <div class="value">${emp.name || '—'}</div>
      <div class="label">Employee ID</div>
      <div class="value">${emp.employeeId || '—'}</div>
      <div class="label">Grade</div>
      <div class="value">${emp.grade || '—'}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Trip Details</div>
    <table>
      <tr><th>Route</th><td>${trip.startLocation || '—'} → ${trip.destination || '—'}</td></tr>
      <tr><th>Trip Date</th><td>${trip.date || '—'}</td></tr>
      <tr><th>Trip Type</th><td>${(trip.tripType || '—').toUpperCase()}</td></tr>
      <tr><th>Conveyance</th><td>${(trip.conveyance || '—').toUpperCase()}</td></tr>
      <tr><th>Distance (km)</th><td>${trip.distanceKm || 0}</td></tr>
      ${trip.ticketAmount ? `<tr><th>Ticket Amount</th><td>₹${trip.ticketAmount.toLocaleString('en-IN')}</td></tr>` : ''}
    </table>
  </div>

  <div class="section">
    <div class="section-title">Expense Breakdown</div>
    <table class="amount-table">
      <thead><tr><th>Component</th><th>Amount (₹)</th></tr></thead>
      <tbody>
        <tr><td>Conveyance / Travel (TA)</td><td>₹${(amounts.conveyance || 0).toLocaleString('en-IN')}</td></tr>
        <tr><td>Daily Allowance (DA)</td><td>₹${(amounts.dailyAllowance || 0).toLocaleString('en-IN')}</td></tr>
        <tr><td>Stay / Lodging</td><td>₹${(amounts.stay || 0).toLocaleString('en-IN')}</td></tr>
        <tr><td>Other Expenses${amounts.otherDescription ? ' — ' + amounts.otherDescription : ''}</td><td>₹${(amounts.other || 0).toLocaleString('en-IN')}</td></tr>
        <tr class="total-row"><td><strong>Total Claimed</strong></td><td><strong>₹${(amounts.total || 0).toLocaleString('en-IN')}</strong></td></tr>
        ${amounts.approvedAmount != null ? `<tr class="approved-row"><td><strong>Approved Amount</strong></td><td><strong>₹${amounts.approvedAmount.toLocaleString('en-IN')}</strong></td></tr>` : ''}
      </tbody>
    </table>
  </div>

  ${history.length > 0 ? `
  <div class="section">
    <div class="section-title">Approval History</div>
    <table>
      <thead><tr><th>Action</th><th>By</th><th>Role</th><th>Remarks</th><th>Date/Time</th></tr></thead>
      <tbody>${historyRows}</tbody>
    </table>
  </div>` : ''}

  <div class="signatures">
    <div class="sig-box"><div class="sig-line">Employee Signature</div></div>
    <div class="sig-box"><div class="sig-line">Service Head</div></div>
    <div class="sig-box"><div class="sig-line">Accounts Dept</div></div>
  </div>

  <div class="footer">
    This is a computer-generated document. Printed on ${new Date().toLocaleString('en-IN')}.
  </div>
</body>
</html>`;
}

export default function BillDetailScreen({ route, navigation }) {
  const billId = route.params?.billId || route.params?.id;
  const { user } = useAuth();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBill = useCallback(async () => {
    try {
      const data = await getBillById(billId);
      setBill(data.bill);
    } catch (e) {
      Alert.alert('Error', 'Failed to load bill details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [billId]);

  useEffect(() => { fetchBill(); }, [fetchBill]);

  const handleSubmit = async () => {
    Alert.alert('Submit Bill', 'Submit this bill for Branch Manager review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Submit', onPress: async () => {
          setActionLoading(true);
          try {
            await submitBill(billId);
            Alert.alert('Submitted!', 'Bill sent to Branch Manager for review.');
            fetchBill();
          } catch (e) {
            Alert.alert('Error', e?.response?.data?.message || 'Failed to submit.');
          } finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const handleApprove = async () => {
    Alert.alert('Approve Bill', 'Approve this bill and forward to next stage?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve', onPress: async () => {
          setActionLoading(true);
          try {
            await approveBill(billId);
            Alert.alert('Approved!', 'Bill forwarded to next approver.');
            fetchBill();
          } catch (e) {
            Alert.alert('Error', e?.response?.data?.message || 'Failed to approve.');
          } finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const handleReject = async () => {
    Alert.prompt
      ? Alert.prompt('Reject Bill', 'Provide rejection reason:', async (remarks) => {
          if (!remarks) return;
          setActionLoading(true);
          try {
            await rejectBill(billId, remarks);
            Alert.alert('Rejected', 'Bill returned to engineer.');
            fetchBill();
          } catch (e) { Alert.alert('Error', e?.response?.data?.message || 'Failed to reject.'); }
          finally { setActionLoading(false); }
        })
      : Alert.alert('Reject Bill', 'Bill will be returned to engineer.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject', style: 'destructive', onPress: async () => {
              setActionLoading(true);
              try {
                await rejectBill(billId, 'Rejected by approver');
                Alert.alert('Rejected', 'Bill returned to engineer.');
                fetchBill();
              } catch (e) { Alert.alert('Error', e?.response?.data?.message || 'Failed.'); }
              finally { setActionLoading(false); }
            },
          },
        ]);
  };

  const handlePay = async () => {
    Alert.alert('Mark as Paid', 'Confirm that this bill has been processed for payment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Paid', onPress: async () => {
          setActionLoading(true);
          try {
            await markBillPaid(billId);
            Alert.alert('Done!', 'Bill marked as paid.');
            fetchBill();
          } catch (e) {
            Alert.alert('Error', e?.response?.data?.message || 'Failed to mark paid.');
          } finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const handlePrint = async () => {
    setActionLoading(true);
    try {
      const printData = await getBillPrint(billId);
      const html = buildPrintHTML(printData);
      await RNPrint.print({ html });
    } catch (e) {
      if (e?.message !== 'User cancelled') {
        Alert.alert('Print Error', 'Could not open printer. Try again.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!bill) return <View style={styles.center}><Text>Bill not found</Text></View>;

  const cfg = STATUS_CONFIG[bill.status] || { label: bill.status, color: colors.textMuted };
  const canSubmit = user?.role === 'service_engineer' && (bill.status === 'draft' || bill.status === 'rejected');
  const canApprove = (
    (user?.role === 'branch_manager' && bill.status === 'submitted') ||
    (user?.role === 'hr' && bill.status === 'approved_by_bm') ||
    (user?.role === 'service_head' && bill.status === 'approved_by_hr') ||
    user?.role === 'super_admin'
  );
  const canReject = canApprove && !['draft', 'approved', 'paid'].includes(bill.status);
  const canPay = user?.role === 'account_dept' && bill.status === 'approved';
  const canEditAmounts = user?.role === 'service_head' && bill.status === 'approved_by_hr';
  const canPrint = bill.status === 'approved' || bill.status === 'paid';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBill(); }} />}
    >
      {/* Header */}
      <View style={styles.headerCard}>
        <Text style={styles.billNumber}>{bill.billNumber}</Text>
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        {bill.branch && <Text style={styles.branchText}>{bill.branch.name}</Text>}
      </View>

      {/* Amounts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bill Summary</Text>
        <AmountRow label="Conveyance (TA)" value={bill.conveyanceAmount} />
        <AmountRow label="Daily Allowance (DA)" value={bill.daAmount} />
        <AmountRow label="Stay / Lodging" value={bill.stayAmount} />
        <AmountRow label="Other Expenses" value={bill.otherAmount} note={bill.otherDescription} />
        <View style={styles.divider} />
        <AmountRow label="Total Claimed" value={bill.totalAmount} bold />
        {bill.approvedAmount != null && (
          <AmountRow label="Approved Amount" value={bill.approvedAmount} bold color={colors.success} />
        )}
      </View>

      {/* Trip info */}
      {bill.trip && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Associated Trip</Text>
          <Text style={styles.infoText}>{bill.trip.startLocation} → {bill.trip.destination}</Text>
          <Text style={styles.infoMuted}>{new Date(bill.trip.date).toLocaleDateString('en-IN')}</Text>
        </View>
      )}

      {/* Approval Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Approval Progress</Text>
        <ApprovalTimeline bill={bill} />
      </View>

      {/* Approval History */}
      {bill.approvalHistory?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>History</Text>
          {bill.approvalHistory.map((h, i) => <HistoryItem key={i} item={h} />)}
        </View>
      )}

      {/* Action Buttons */}
      {(canSubmit || canApprove || canPay || canEditAmounts || canPrint) && (
        <View style={styles.actions}>
          {canSubmit && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit} disabled={actionLoading}>
              {actionLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryBtnText}>Submit for Approval</Text>}
            </TouchableOpacity>
          )}
          {canEditAmounts && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.warning }]}
              onPress={() => navigation.navigate('EditBillAmounts', { billId })}
            >
              <Text style={styles.primaryBtnText}>✏️ Edit Amounts</Text>
            </TouchableOpacity>
          )}
          {canApprove && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleApprove} disabled={actionLoading}>
              <Text style={styles.primaryBtnText}>✅ Approve</Text>
            </TouchableOpacity>
          )}
          {canReject && (
            <TouchableOpacity style={[styles.primaryBtn, styles.dangerBtn]} onPress={handleReject} disabled={actionLoading}>
              <Text style={styles.primaryBtnText}>❌ Reject</Text>
            </TouchableOpacity>
          )}
          {canPay && (
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.success }]} onPress={handlePay} disabled={actionLoading}>
              <Text style={styles.primaryBtnText}>💳 Mark as Paid</Text>
            </TouchableOpacity>
          )}
          {canPrint && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#0F4C81' }]}
              onPress={handlePrint}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>🖨️ Print / Save PDF</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function AmountRow({ label, value, bold, color, note }) {
  return (
    <View style={styles.amountRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.amountLabel, bold && { fontWeight: '700' }]}>{label}</Text>
        {note ? <Text style={styles.amountNote}>{note}</Text> : null}
      </View>
      <Text style={[styles.amountValue, bold && { fontWeight: '800', fontSize: 16 }, color && { color }]}>
        ₹{(value || 0).toLocaleString('en-IN')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  billNumber: { fontSize: 20, fontWeight: '800', color: colors.white },
  statusText: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  branchText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },

  section: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  amountRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  amountLabel: { fontSize: 14, color: colors.text },
  amountNote: { fontSize: 11, color: colors.textMuted },
  amountValue: { fontSize: 14, fontWeight: '600', color: colors.text },

  infoText: { fontSize: 15, fontWeight: '600', color: colors.text },
  infoMuted: { color: colors.textMuted, fontSize: 13, marginTop: 2 },

  // Timeline
  timeline: { paddingLeft: spacing.sm },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, position: 'relative' },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  timelineDotText: { color: colors.white, fontWeight: '700', fontSize: 11 },
  timelineContent: { flex: 1, paddingTop: 4 },
  stageLabel: { fontSize: 13, color: colors.textMuted },
  timelineLine: {
    position: 'absolute',
    left: 13,
    top: 28,
    width: 2,
    height: spacing.sm,
    backgroundColor: colors.border,
  },

  // History
  historyItem: { flexDirection: 'row', marginBottom: spacing.md },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, marginRight: spacing.sm },
  historyAction: { fontSize: 13, color: colors.text },
  historyRemarks: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  historyTime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  // Actions
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  dangerBtn: { backgroundColor: colors.danger },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
