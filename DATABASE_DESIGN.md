# InnoSet Database Design - New System Architecture

> **Document Version:** 4.0 | **Date:** September 4, 2026 | **Status:** Completed & Verified Architecture

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Current vs New Architecture](#2-current-vs-new-architecture)
3. [Multi-Branch 5 Dealership Architecture](#3-multi-branch-5-dealership-architecture)
4. [New Database Schema](#4-new-database-schema)
5. [TA/DA Bill Approval Workflow](#5-tada-bill-approval-workflow)
6. [Attendance Approval Workflow](#6-attendance-approval-workflow)
7. [Role-Based Access Control](#7-role-based-access-control-rbac)
8. [API Endpoints](#8-api-endpoints-overview)
9. [Data Flow Diagrams](#9-data-flow-diagrams)
10. [Implementation Checklist](#10-implementation-checklist)
11. [Migration Strategy](#11-migration-strategy)

---

## 1. System Overview

### What We Are Building

InnoSet is transforming from a **single-branch trip tracking app** into a **multi-branch management system** that manages **5 dealerships** independently. The system now handles:

| Feature | Description |
|---------|-------------|
| **Multi-Branch** | 5 independent dealership branches in one app |
| **TA/DA Bill Approval** | 4-stage approval workflow for travel bills |
| **Attendance System** | Daily attendance marking with HR approval |
| **Role-Based Access** | 6 distinct user roles with different permissions |
| **Branch Isolation** | Data is isolated per branch except HQ |

### High-Level System Architecture

```
                    INNOSET SYSTEM ARCHITECTURE

  [Branch 1]  [Branch 2]  [Branch 3]  [Branch 4]  [Branch 5]
   Indore      Bhopal      Jabalpur     Ujjain       Dewas
     |            |            |            |            |
     +------------+------------+-----+------+------------+
                                        |
                                 +------+-------+
                                 |  HQ (HQ)    |
                                 |  Dashboard  |
                                 +------+-------+
                                        |
                          +-------------v-----------+
                          |    MongoDB Database     |
                          |  Branch-scoped queries  |
                          +-------------------------+
```

---

## 2. Current vs New Architecture

### Current System v3.x - Single Branch Tracking App

```
                    CURRENT ARCHITECTURE

   Roles: engineer, admin  - 2 roles only

   +----------------+    +----------------+
   |   Engineer     |    |    Admin       |
   | - Create Trip  |    | - View All     |
   | - Track GPS    |    | - Approve      |
   | - Upload Docs  |    | - Reject       |
   | - Submit       |    | - Dashboard    |
   +-------+--------+    +-------+--------+
           |                    |
           +--------+-----------+
                    v
            +----------------+
            |   Trip Model   | <- Only entity
            |   User Model   | <- 2 roles
            +----------------+

   X No branch separation
   X No attendance tracking
   X No multi-level approval
   X Single admin workflow
```

### New System v4.x - Multi-Branch Management System

```
                    NEW ARCHITECTURE v4.x

   Roles: service_engineer, branch_manager, hr,
          service_head, account_dept, super_admin

   +----------------+  +----------------+  +----------------+
   |Service Engineer|  |Branch Manager  |  |  HR Dept       |
   | - Mark Attend. |  | - Review Bills |  | - Verify Bills |
   | - Raise TA/DA  |  | - Approve Bills|  | - Approve Bills|
   | - View Status  |  | - View Branch  |  | - Verify Attend|
   +-------+--------+  +-------+--------+  +-------+--------+
           |                    |                    |
           +--------------------+--------------------+
                                v
   +----------------+  +----------------+  +----------------+
   | Service Head   |  | Account Dept   |  | Super Admin    |
   | - Final Approve|  | - View Approved|  | - All Branches |
   | - Edit Amount  |  | - Process Pay  |  | - System Config|
   +-------+--------+  +-------+--------+  +-------+--------+
           |                    |                    |
           +--------------------+--------------------+
                                v
              +------------------------------------+
              |     Multi-Entity System            |
              |  - Branch 5 dealerships            |
              |  - User branch-scoped              |
              |  - TADABill approval chain          |
              |  - Attendance daily records         |
              |  - Trip enhanced                    |
              +------------------------------------+
```

### Key Differences

| Feature | Current v3 | New v4 |
|---------|-----------|--------|
| Branches | None single | 5 Dealerships + HQ |
| User Roles | 2 eng admin | 6 eng BM HR SH Acct super_admin |
| Approval Flow | 1-step admin | 4-step BM HR SH Acct |
| Attendance | Not supported | Daily mark + HR approve |
| TA/DA Bills | Embedded in Trip | Standalone bill system |
| Data Isolation | Global | Branch-scoped |
| Dashboard | Single view | Per-branch + HQ overview |

---

## 3. Multi-Branch 5 Dealership Architecture

### Branch Structure

```
                     INNOSET BRANCH STRUCTURE

                    +----------------------+
                    |    HEADQUARTERS      |
                    |     Super Admin      |
                    |  Cross-branch view   |
                    |  System config       |
                    +----------+-----------+
                               |
          +--------------------+--------------------+
          |                    |                    |
  +-------v-------+  +-------v-------+  +-------v-------+
  | Branch 1      |  | Branch 2      |  | Branch 3      |
  |   INDORE      |  |   BHOPAL      |  |   JABALPUR    |
  | BM + HR + Engs|  | BM + HR + Engs|  | BM + HR + Engs|
  +---------------+  +---------------+  +---------------+

          +--------------------+--------------------+
          |                    |                    |
  +-------v-------+  +-------v-------+
  | Branch 4      |  | Branch 5      |
  |   UJJAIN      |  |   DEWAS       |
  | BM + HR + Engs|  | BM + HR + Engs|
  +---------------+  +---------------+

  SHARED ROLES across all branches:
  - Service Head: oversees all branches service dept
  - Account Dept: processes bills from all branches
  - Super Admin: full system access
```

### Branch Scoping Rules

| User Role | Can See/Access |
|-----------|---------------|
| service_engineer | Own data only (trips, attendance) |
| branch_manager | All data in their branch |
| hr | All data in their branch |
| service_head | All branches (service dept) |
| account_dept | All branches (approved bills only) |
| super_admin | EVERYTHING across all branches |

```
  Query Patterns:

  // Branch-scoped query (most common)
  Trip.find({ branch: req.user.branchId })

  // Cross-branch query (service_head, account_dept, super_admin)
  Trip.find({})

  // My own data (engineer)
  Trip.find({ engineer: req.userId })
```

---

## 4. New Database Schema

### Entity Relationship Diagram

```
                    ENTITY RELATIONSHIP DIAGRAM

  +--------------+         +------------------+        +--------------+
  |   Branch     | 1    N |      User         | 1   N  |    Trip       |
  |--------------|--------|------------------|--------|--------------|
  | _id          |        | _id               |        | _id          |
  | name         |        | name              |        | engineer <----|-- ref:User
  | code BR01    |        | employeeId        |        | branch <------|-- ref:Branch
  | address      |        | email             |        | startLocation |
  | city         |        | passwordHash      |        | destination   |
  | phone        |        | role              |        | date          |
  | isActive     |        | branch <-----------|-- ref:Branch
  | createdAt    |        | grade             |        | tripType      |
  +--------------+        | isActive          |        | status        |
                          | createdAt         |        | grandTotal    |
                          +------------------+        +------+-------+
                                   |                         |
                                   | 1                       | 1
                                   v N                       v N
                          +------------------+     +------------------+
                          |   Attendance      |     |    TADABill      |
                          |------------------|     |------------------|
                          | _id               |     | _id              |
                          | employee <---------|     | trip <------------|-- ref:Trip
                          |   ref:User        |     | employee <-------|-- ref:User
                          | branch <-----------|     | branch <---------|-- ref:Branch
                          |   ref:Branch      |     | totalAmount      |
                          | date              |     | status           |
                          | status            |     | currentApprover  |
                          |   present/leave/  |     +--------+---------+
                          |   on_duty         |              |
                          | approvedBy <-------|              | 1
                          | isLocked          |              v N
                          +------------------+     +------------------+
                                                   | BillApproval      |
                                                   |------------------|
                                                   | _id              |
                                                   | bill <------------|-- ref:TADABill
                                                   | approver <--------|-- ref:User
                                                   | action           |
                                                   |   approve/reject |
                                                   |   /edit          |
                                                   | remarks          |
                                                   | timestamp        |
                                                   +------------------+

  Legend: <---- = Foreign Key Reference
          1   N  = One-to-Many Relationship
```

### 4.1 Branch Collection - NEW

```javascript
const branchSchema = new mongoose.Schema({
  name: String,              // "Indore Branch"
  code: String,              // "BR01" unique branch identifier
  address: String,           // Full address
  city: String,              // "Indore"
  state: String,             // "Madhya Pradesh"
  phone: String,             // Branch contact number
  attendanceCutoffTime: String,  // "09:30" daily attendance deadline
  isActive: Boolean,         // Soft-delete flag (default: true)
  createdAt: Date,
  updatedAt: Date
});

branchSchema.index({ code: 1 }, { unique: true });
branchSchema.index({ name: 1 });
```

**Pre-seeded Branches:**

| Code | Name | City |
|------|------|------|
| BR01 | Indore Branch | Indore |
| BR02 | Bhopal Branch | Bhopal |
| BR03 | Jabalpur Branch | Jabalpur |
| BR04 | Ujjain Branch | Ujjain |
| BR05 | Dewas Branch | Dewas |

---

### 4.2 User Collection - MODIFIED

> Added fields: `branch`, expanded `role` enum, `isActive`

```javascript
const userSchema = new mongoose.Schema({
  // Existing fields (keep as-is)
  name: String,              // "Rahul Sharma"
  employeeId: String,        // "EMP001" unique
  email: String,             // "rahul@innoset.com"
  passwordHash: String,
  grade: String,             // "IE7" drives TA/DA rates

  // MODIFIED field
  role: String,              // EXPANDED enum:
  // "service_engineer"  - was "engineer"
  // "branch_manager"    - NEW: manages a single branch
  // "hr"                - NEW: HR department staff
  // "service_head"      - NEW: final approval authority
  // "account_dept"      - NEW: accounts/finance department
  // "super_admin"       - was "admin" renamed

  // NEW fields
  branch: ObjectId,          // ref: "Branch" which dealership
  isActive: Boolean,         // Soft-delete (default: true)

  createdAt: Date,
  updatedAt: Date
});

userSchema.index({ employeeId: 1 }, { unique: true });
userSchema.index({ branch: 1 });
userSchema.index({ role: 1 });
userSchema.index({ branch: 1, role: 1 });
```

---

### 4.3 Trip Collection - MODIFIED

> Added field: `branch`, expanded `status` enum, new `approvalTrail`

```javascript
const tripSchema = new mongoose.Schema({
  engineer: ObjectId,        // ref: "User"
  startLocation: String,
  destination: String,
  date: Date,
  tripType: String,          // "round" | "stay"
  conveyance: String,        // "bike" | "car" | "bus" | "train"

  status: String,            // EXPANDED enum:
  // "draft" - "in_progress" - "at_site" - "returning"
  // "completed" - "submitted" (to Branch Manager)
  // "approved_by_bm" - NEW: BM approved, pending HR
  // "approved_by_hr" - NEW: HR approved, pending SH
  // "approved_by_sh" - NEW: SH approved, pending Acct
  // "approved" - fully approved, visible to Accounts
  // "rejected" - rejected at any stage

  // ... GPS, tracking, expense fields unchanged ...

  // NEW fields
  branch: ObjectId,          // ref: "Branch"

  // NEW: full approval audit trail
  approvalTrail: [{
    approver: ObjectId,      // ref: "User"
    role: String,            // "branch_manager" | "hr" | "service_head"
    action: String,          // "approved" | "rejected" | "edited"
    remarks: String,
    editedAmount: Number,    // SH can edit final amount
    timestamp: Date
  }],

  createdAt: Date,
  updatedAt: Date
});

tripSchema.index({ branch: 1 });
tripSchema.index({ branch: 1, status: 1 });
```

### 4.4 TADABill Collection - NEW

> Core entity powering the TA/DA Bill Approval workflow.

```javascript
const tadaBillSchema = new mongoose.Schema({
  // References
  trip: ObjectId,            // ref: Trip
  employee: ObjectId,        // ref: User - who raised this bill
  branch: ObjectId,          // ref: Branch

  // Bill Details
  billNumber: String,        // "BR01-TA-2026-000001" auto-generated
  billDate: Date,            // When the bill was raised

  // Financial Details
  totalAmount: Number,       // Total claimed amount
  approvedAmount: Number,    // Final approved amount
  conveyanceAmount: Number,  // TA component
  daAmount: Number,          // DA component
  stayAmount: Number,        // Lodging component
  otherAmount: Number,       // Any other expenses
  otherDescription: String,

  // Supporting Documents
  receipts: [{
    data: Buffer,            // File bytes (select: false)
    contentType: String,
    filename: String,
    sizeBytes: Number,
    category: String,        // "ticket" | "hotel" | "food" | "other"
    amount: Number,
    uploadedAt: Date
  }],

  // Approval Status
  status: String,
  // "draft" - Engineer is still editing
  // "submitted" - Awaiting Branch Manager review
  // "approved_by_bm" - BM approved, awaiting HR
  // "approved_by_hr" - HR approved, awaiting Service Head
  // "approved_by_sh" - SH approved (final), awaiting Accounts
  // "approved" - Fully approved, visible to Account Dept
  // "rejected" - Rejected at any stage
  // "paid" - Account Dept processed payment

  currentApprover: ObjectId, // ref: User - who should act next

  // Approval Trail (full audit log)
  approvalHistory: [{
    approver: ObjectId,
    approverName: String,   // Denormalized for display
    approverRole: String,
    action: String,         // "submitted" | "approved" | "rejected" | "edited"
    remarks: String,
    editedAmount: Number,   // Service Head can edit
    timestamp: Date
  }],

  // Service Head Edit Permissions
  canEdit: Boolean,         // true only when status is "approved_by_hr"
  editedBy: ObjectId,       // ref: User - SH who edited
  editHistory: [{
    field: String,
    oldValue: Number,
    newValue: Number,
    editedBy: ObjectId,
    editedAt: Date
  }],

  createdAt: Date,
  updatedAt: Date
});

// Bill Number: {BranchCode}-TA-{Year}-{SequentialNumber}
// Example: BR01-TA-2026-000001
tadaBillSchema.index({ billNumber: 1 }, { unique: true });
tadaBillSchema.index({ employee: 1, createdAt: -1 });
tadaBillSchema.index({ branch: 1, status: 1 });
tadaBillSchema.index({ currentApprover: 1 });
tadaBillSchema.index({ status: 1 });
```

---

### 4.5 BillApproval Collection - NEW

> Audit trail for every approval action on a bill.

```javascript
const billApprovalSchema = new mongoose.Schema({
  bill: ObjectId,            // ref: TADABill
  approver: ObjectId,        // ref: User

  action: String,            // "submitted" | "approved" | "rejected" | "edited"
  previousStatus: String,    // Status before this action
  newStatus: String,         // Status after this action

  previousAmount: Number,    // For edits
  newAmount: Number,

  remarks: String,
  timestamp: Date
});
```

---

### 4.6 Attendance Collection - NEW

> Daily attendance records with HR approval workflow.

```javascript
const attendanceSchema = new mongoose.Schema({
  // References
  employee: ObjectId,        // ref: User
  branch: ObjectId,          // ref: Branch

  // Attendance Details
  date: Date,                // The day normalized to midnight
  status: String,
  // "present" - Employee is on duty
  // "absent" - Employee did not mark
  // "leave" - Employee applied for leave
  // "on_duty" - Employee is on official duty outside office

  // Leave Details (when status = leave)
  leaveType: String,         // "casual" | "sick" | "earned" | "unpaid" | "other"
  leaveReason: String,
  leaveDocumentUrl: String,  // Medical certificate etc.

  // On Duty Details (when status = on_duty)
  onDutyLocation: String,
  onDutyPurpose: String,

  // Approval
  approvedBy: ObjectId,      // ref: User - HR who approved
  approvedAt: Date,
  approvalRemarks: String,

  // Approval Status
  approvalStatus: String,
  // "pending" - Employee marked, awaiting HR review
  // "approved" - HR approved (record locked)
  // "rejected" - HR rejected, employee needs to re-mark

  isLocked: Boolean,         // Once HR approves = true = no edits

  // Cut-off compliance
  markedBeforeCutoff: Boolean,
  markedAt: Date,            // Exact time they submitted

  createdAt: Date,
  updatedAt: Date
});

// One record per day per employee
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ branch: 1, date: 1 });
attendanceSchema.index({ branch: 1, date: 1, approvalStatus: 1 });
attendanceSchema.index({ approvedBy: 1, date: 1 });
```

---

## 5. TA/DA Bill Approval Workflow

### Flow Diagram

```
                   TA/DA BILL APPROVAL WORKFLOW

   +------------------------------+
   |  1. SERVICE ENGINEER          |
   |  Raise TA/DA Bill             |
   |  Attach receipts              |
   |  Submit for review            |
   +--------------+---------------+
                  | status: submitted
                  | currentApprover: Branch Manager
                  v
   +------------------------------+
   |  2. BRANCH MANAGER           |
   |  Reviews the bill             |
   |  Checks amounts               |
   |  Verifies receipts            |
   |  Approve / Reject             |
   +--------------+---------------+
                  | status: approved_by_bm
                  | currentApprover: HR Department
                  v
   +------------------------------+
   |  3. HR DEPARTMENT            |
   |  Verifies the bill            |
   |  Checks policy                |
   |  Ensures compliance           |
   |  Approve / Reject             |
   +--------------+---------------+
                  | status: approved_by_hr
                  | currentApprover: Service Head
                  | canEdit: true
                  v
   +------------------------------+
   |  4. SERVICE HEAD              |
   |  FINAL APPROVAL AUTHORITY     |
   |  Can EDIT amounts             |
   |  e.g. policy exception        |
   |  Approve -> Bill is DONE      |
   +--------------+---------------+
                  | status: approved
                  | currentApprover: null
                  v
   +------------------------------+
   |  5. APPROVED                  |
   |  Bill fully approved          |
   +--------------+---------------+
                  |
                  v
   +------------------------------+
   |  6. ACCOUNT DEPARTMENT        |
   |  Views approved bills         |
   |  Processes payment            |
   |  Marks as paid                |
   +------------------------------+

  REJECTION PATH at any stage:
  Any Approver -> Rejects -> status: rejected
  -> Bill goes back to Engineer
  -> Engineer can edit and resubmit
  -> Flow restarts from Step 1
```

### Bill Status State Machine

```
                    BILL STATUS STATE MACHINE

  +--------+   submit    +------------+   approve   +----------------+
  |  DRAFT +------------>| SUBMITTED  +------------>| APPROVED_BY_BM |
  +--------+             +-----+------+             +-------+--------+
                          |                               |
                          | reject                        | approve
                          v                               v
                   +------------+               +----------------+
                   | REJECTED   |               | APPROVED_BY_HR |
                   +-----+------+               +-------+--------+
                         |                               |
                         | resubmit                      | approve
                         | (SH can edit)                 v
                         |                     +----------------+
                         |                     | APPROVED_BY_SH |
                         |                     +-------+--------+
                         |                             |
                         |                             | auto-finalize
                         |                             v
                         |                     +----------------+
                         |                     |   APPROVED     |
                         |                     +-------+--------+
                         |                             |
                         |                             | Acct processes
                         |                             v
                         |                     +----------------+
                         |                     |     PAID       |
                         |                     +----------------+
```

**State Transition Table:**

| Current Status | Trigger | New Status |
|---------------|---------|------------|
| draft | submit | submitted |
| submitted | approve (BM) | approved_by_bm |
| submitted | reject (BM) | rejected |
| approved_by_bm | approve (HR) | approved_by_hr |
| approved_by_bm | reject (HR) | rejected |
| approved_by_hr | approve (SH) | approved_by_sh |
| approved_by_hr | reject (SH) | rejected |
| approved_by_hr | edit (SH) | approved_by_sh |
| approved_by_sh | auto-finalize | approved |
| approved | process payment | paid |
| rejected | resubmit | submitted |

### Approval Chain - Sequence Diagram

```
   Engineer      Branch Mgr    HR Dept      Service Head   Account Dept
     |              |            |              |              |
     |--Create Bill->            |              |              |
     |--Submit------>|            |              |              |
     |              |            |              |              |
     |              |--Review-->  |              |              |
     |              |<Checks--   |              |              |
     |              |            |              |              |
     |              |--Approve-->|              |              |
     |              |            |              |              |
     |              |            |--Verify-->   |              |
     |              |            |<Policy--     |              |
     |              |            |              |              |
     |              |            |--Approve---->|              |
     |              |            |              |              |
     |              |            |              |--Review-->   |
     |              |            |              |<Can Edit--   |
     |              |            |              |              |
     |              |            |              |--Approve---->|
     |              |            |              |  (or Edit)   |
     |              |            |              |              |
     |              |            |              |              |--Process->
     |              |            |              |              |<Payment--
     |              |            |              |              |
     |<------- Notification: BILL PAID -----------------------|
```

---

## 6. Attendance Approval Workflow

### Flow Diagram

```
                 ATTENDANCE APPROVAL WORKFLOW
     Daily Leave / On Duty Reporting by All Employees

   +------------------------------------------+
   |  1. ALL EMPLOYEES                        |
   |  Mark Daily Attendance Status:           |
   |    - Present (On Duty)                   |
   |    - Leave (specify type + doc)          |
   |    - On Duty (outside office)            |
   |  BEFORE cut-off time (09:30 AM)         |
   +------------------+-----------------------+
                     | status: pending
                     v
   +------------------------------------------+
   |  2. HR DEPARTMENT                        |
   |  - Reviews all pending records           |
   |  - Verifies leave documents              |
   |  - Checks leave policy compliance        |
   |  - Approve / Reject each                 |
   |  - Bulk approve available                |
   +------------------+-----------------------+
                     | status: approved + isLocked: true
                     v
   +------------------------------------------+
   |  3. ATTENDANCE CONFIRMED                  |
   |  - Record LOCKED for the day             |
   |  - No further edits allowed             |
   |  - Shows in attendance reports           |
   +------------------------------------------+

  KEY RULES:
  - All employees MUST mark daily before cut-off time
  - Once approved by HR = FINAL for the day (locked)
  - System maintains complete attendance history and reports
  - Leave requires document upload (if sick leave)
  - After cut-off = auto-set as absent
```

### Attendance State Machine

```
                    ATTENDANCE STATUS STATE MACHINE

  +----------+   mark      +----------+   approve   +----------+
  | (none)   +----------->| PENDING  +----------->| APPROVED |
  |(not yet  |             +----+-----+             +----+-----+
  | marked)  |                  |                          |
  +----------+                  | reject                   | LOCK
                                v                          v
                         +----------+              +----------+
                         | REJECTED +------------->|  LOCKED  |
                         +----+-----+ re-mark      +----------+
                              |
                              +--> pending (cycle)

  Attendance Status Table:
  +----------------+----------------+--------------------+
  | Current        | Trigger        | New Status         |
  +----------------+----------------+--------------------+
  | (none)         | employee marks | pending            |
  | pending        | HR approves    | approved (locked)  |
  | pending        | HR rejects     | rejected           |
  | rejected       | employee re-mark| pending           |
  +----------------+----------------+--------------------+
```

### Daily Attendance Timeline

```
  00:00     06:00     09:00  09:30  12:00  17:00  23:59
    |          |          |      |      |      |      |
    |<- System prepares records
    |          |          |      |      |      |      |
    |          |          |<- OPEN: Mark attendance
    |          |          |      |      |      |      |
    |          |          |      |<- CUTOFF
    |          |          |      |      |      |      |
    |          |          |      | Unmarked = Absent
    |          |          |      |      |      |      |
    |          |          |      | HR reviews and
    |          |          |      | approves throughout
    |          |          |      | the day
    |          |          |      |      |      | Record
    |          |          |      |      |      | locked

  Rules:
  - Marking window: 00:00 to 09:30 cut-off
  - After cut-off: system auto-sets unmarked as absent
  - HR can approve/reject throughout the business day
  - Once HR approves: record is LOCKED, no changes allowed
```

---

## 7. Role-Based Access Control RBAC

### Role Hierarchy

```
                      ROLE HIERARCHY

                   +------------------+
                   |   SUPER ADMIN    |
                   |   Full system    |
                   |   access         |
                   +--------+---------+
                            |
             +--------------+--------------+
             v              v              v
     +------------+  +------------+  +------------+
     | SERVICE    |  | ACCOUNT    |  | BRANCH     |
     | HEAD       |  | DEPT       |  | MANAGER    |
     | Final Auth |  | Payments   |  | Own Branch |
     +------+-----+  +------+-----+  +------+-----+
            |               |               |
            |               |          +----+----+
            |               |          v         v
            |               |   +----------+ +--------+
            |               |   | HR       | | ENGINE |
            |               |   | DEPT     | | (SE)   |
            |               |   +----------+ +--------+

  Permission Levels:
  Super Admin > Service Head > Account Dept > Branch Manager
                                > HR > Service Engineer
```

### Permission Matrix

| Feature | SEng | BrMgr | HR | SvcHead | Acct | SuperAdm |
|---------|------|-------|----|---------|------|----------|
| **TRIPS** | | | | | | |
| Create Trip | Y | Y | Y | Y | - | Y |
| View Own Trips | Y | Y | Y | Y | - | Y |
| View Branch Trips | - | Y | Y | Y | Y | Y |
| View All Trips | - | - | - | Y | Y | Y |
| Approve Trip | - | - | - | Y | - | Y |
| **TA/DA BILLS** | | | | | | |
| Create Bill | Y | Y | Y | Y | - | Y |
| View Own Bills | Y | Y | Y | Y | - | Y |
| View Branch Bills | - | Y | Y | Y | Y | Y |
| View All Bills | - | - | - | Y | Y | Y |
| BM Approve | - | Y* | - | - | - | - |
| HR Approve | - | - | Y* | - | - | - |
| SH Approve+Edit | - | - | - | Y* | - | - |
| Mark as Paid | - | - | - | - | Y* | - |
| **ATTENDANCE** | | | | | | |
| Mark Attendance | Y | Y | Y | Y | Y | Y |
| View Own Record | Y | Y | Y | Y | Y | Y |
| View Branch | - | Y | Y | Y | Y | Y |
| View All Branches | - | - | - | Y | Y | Y |
| Approve/Reject | - | - | Y* | - | - | - |
| **USER MANAGEMENT** | | | | | | |
| Create Engineer | - | Y** | - | - | - | Y |
| View Engineers | - | Y | Y | Y | - | Y |
| Create Branch | - | - | - | - | - | Y |
| **REPORTS** | | | | | | |
| Own Reports | Y | Y | Y | Y | - | Y |
| Branch Reports | - | Y | Y | Y | Y | Y |
| All Reports | - | - | - | Y | Y | Y |
| Export/PDF | - | Y | Y | Y | Y | Y |

\* Only when the bill/attendance is in their approval queue
\*\* Only within their own branch

---

## 8. API Endpoints Overview

### Authentication

```
  POST   /api/auth/login
  POST   /api/auth/register       (admin only, within branch)
  GET    /api/auth/me              (current user profile)
```

### Branches - Super Admin only

```
  GET    /api/branches             (list all)
  POST   /api/branches             (create new)
  PATCH  /api/branches/:id         (update)
  GET    /api/branches/:id/stats   (branch statistics)
```

### Users - scoped by role

```
  GET    /api/users                (list - scoped by role)
  POST   /api/users                (create - within branch)
  PATCH  /api/users/:id            (update)
  PATCH  /api/users/:id/reset-password
```

### Trips - existing, enhanced

```
  GET    /api/trips                (list - branch-scoped)
  POST   /api/trips                (create - auto-assign branch)
  PATCH  /api/trips/:id            (update)
  DELETE /api/trips/:id
  POST   /api/trips/:id/submit     (submit for approval)
  POST   /api/trips/:id/receipts   (upload receipt)
  GET    /api/trips/:id/receipts/:rid (view receipt)
  POST   /api/trips/:id/location   (GPS tracking)
```

### TA/DA Bills - NEW

```
  GET    /api/bills                (list - role-scoped)
  POST   /api/bills                (create new bill)
  GET    /api/bills/:id            (view details)
  PATCH  /api/bills/:id            (update draft)
  DELETE /api/bills/:id            (delete draft only)
  POST   /api/bills/:id/submit     (submit to Branch Manager)
  POST   /api/bills/:id/approve    (approve at current stage)
  POST   /api/bills/:id/reject     (reject at current stage)
  PATCH  /api/bills/:id/edit       (SH only - edit amounts)
  POST   /api/bills/:id/pay        (Account Dept - mark paid)
  GET    /api/bills/pending        (bills awaiting my approval)
  GET    /api/bills/:id/history    (approval trail)
```

### Attendance - NEW

```
  POST   /api/attendance/mark       (employee marks daily)
  GET    /api/attendance/me         (own records)
  GET    /api/attendance/branch     (branch records - BM/HR)
  GET    /api/attendance/all        (all records - SH/Admin)
  GET    /api/attendance/pending    (pending HR review)
  POST   /api/attendance/:id/approve (HR approves)
  POST   /api/attendance/:id/reject  (HR rejects)
  POST   /api/attendance/bulk-approve (HR bulk approve)
  GET    /api/attendance/report     (attendance report)
```

### Dashboard and Reports

```
  GET    /api/dashboard/stats       (role-based stats)
  GET    /api/dashboard/branch      (branch-level stats)
  GET    /api/dashboard/hq          (HQ cross-branch overview)
  GET    /api/reports/attendance    (attendance report)
  GET    /api/reports/bills         (bill approval report)
  GET    /api/reports/trips         (trip summary report)
  GET    /api/reports/export        (export as CSV/PDF)
```

---

## 9. Data Flow Diagrams

### Complete System Data Flow

```
                    COMPLETE SYSTEM DATA FLOW

  +--------------+
  |   ENGINEER   |
  |              |
  | 1. Marks     |------> +--------------+
  |   Attendance |        |  Attendance   |--> HR Reviews --> LOCKED
  |              |        |  (pending)    |
  | 2. Creates   |------> +--------------+
  |   Trip       |        |    Trip       |
  |              |        |   (draft)     |
  | 3. Finishes  |------> +--------------+
  |   Trip       |        |    Trip       |
  |              |        |  (completed)  |
  | 4. Creates   |------> +--------------+
  |   TA/DA Bill |        |   TADABill    |--> BM Approves
  |              |        |  (draft)     |--> HR Verifies
  +--------------+        |              |--> SH Approves+Edits
                          |              |--> APPROVED
                          +--------------+--> Acct Pays
```

### Monthly Activity Cycle

```
                    MONTHLY ACTIVITY CYCLE

  +----------------------------------------------------------+
  | DAY 1-30: DAILY CYCLE (Every Business Day)               |
  |                                                          |
  |  +----------+  +----------+  +----------+  +---------+  |
  |  | 09:30    |  | 10:00    |  |Throughout |  | EOD     |  |
  |  |CUTOFF    |->| HR       |->| the Day  |->| Record  |  |
  |  |          |  | Reviews  |  | Approved/ |  | Locked  |  |
  |  | Unmarked |  | Pending  |  | Rejected  |  |         |  |
  |  | = Absent |  | Records  |  |           |  |         |  |
  |  +----------+  +----------+  +----------+  +---------+  |
  +----------------------------------------------------------+

  +----------------------------------------------------------+
  | ONGOING: BILL APPROVAL (Continuous)                       |
  |                                                          |
  |  Engineer submits --> BM reviews --> HR verifies --> SH   |
  |  (any day)         (same day?)   (within 2 days?)  final|
  |                                                 |        |
  |                                            SH Edits     |
  |                                            if needed    |
  |                                                 |        |
  |                                            APPROVED     |
  |                                            --> Acct Dept|
  |                                                processes|
  |                                                payment  |
  +----------------------------------------------------------+
```

### Collection Size Estimates

| Collection | Records/Month | Year 1 Estimate |
|-----------|---------------|----------------|
| Branches | 5 (static) | 5 |
| Users | ~75 | ~75 |
| Trips | ~500 | ~6,000 |
| TADABills | ~500 | ~6,000 |
| BillApprovals | ~2,000 | ~24,000 |
| Attendance | ~3,750 | ~45,000 |

> Well within MongoDB capabilities. Estimated 2-5 GB Year 1 with receipts.

---

## 10. Implementation Checklist

### Phase 1: Multi-Branch Foundation ✅

**Database Changes:**
- [x] Create Branch model (`backend/models/Branch.js`)
- [x] Add `branch` field to User model (`backend/models/User.js`)
- [x] Add `branch` field to Trip model (`backend/models/Trip.js`)
- [x] Create seed script for 5 branches (`backend/scripts/seedBranches.js`)
- [x] Migrate existing users to Indore branch (`backend/scripts/migrateExistingData.js`)
- [x] Migrate existing trips to Indore branch (`backend/scripts/migrateExistingData.js`)

**Backend Changes:**
- [x] Create branchController.js + branchRoutes.js (`backend/controllers/branchController.js`, `backend/routes/branchRoutes.js`)
- [x] Update auth middleware to inject branchId from JWT (`backend/middleware/auth.js`)
- [x] Update adminController queries with branch scoping (`backend/controllers/adminController.js`)
- [x] Update tripController queries with branch scoping (`backend/controllers/tripController.js`)
- [x] Add branch validation middleware (`backend/middleware/roleGuard.js` - `branchAccess`)

**Frontend Changes:**
- [x] Update login to include branch in token/payload (`src/services/authService.js`, `src/context/AuthContext.js`)
- [x] Add branch selector (Super Admin only in `SuperAdminDashboardScreen.js` & `UserManagementScreen.js`)
- [x] Update dashboard to show branch-specific data (`src/screens/BranchManagerDashboardScreen.js`, `src/screens/HRDashboardScreen.js`)
- [x] Update all API calls to include branch context (`src/services/api.js`, `src/services/branchService.js`)

---

### Phase 2: Role Expansion ✅

**Database Changes:**
- [x] Expand User.role enum to 6 roles (`service_engineer`, `branch_manager`, `hr`, `service_head`, `account_dept`, `super_admin`)
- [x] Rename engineer to service_engineer (`backend/models/User.js`, `backend/scripts/migrateExistingData.js`)
- [x] Rename admin to super_admin (`backend/models/User.js`, `backend/scripts/migrateExistingData.js`)
- [x] Add role-based middleware roleGuard.js (`backend/middleware/roleGuard.js`)

**Backend Changes:**
- [x] Create roleGuard middleware replacing adminOnly (`backend/middleware/roleGuard.js`)
- [x] Update JWT payload to include branchId + role (`backend/controllers/authController.js`)
- [x] Update all route guards with new roles (`backend/routes/*.js`)

---

### Phase 3: TA/DA Bill Approval System ✅

**Database Changes:**
- [x] Create TADABill model (`backend/models/TADABill.js`)
- [x] Create BillApproval model (`backend/models/BillApproval.js`)
- [x] Add approvalTrail array to Trip model (`backend/models/Trip.js`)
- [x] Expand Trip.status enum with new states (`backend/models/Trip.js`)

**Backend Changes:**
- [x] Create billController.js (CRUD + approval logic) (`backend/controllers/billController.js`)
- [x] Create billRoutes.js (`backend/routes/billRoutes.js`)
- [x] Implement approval state machine (BM -> HR -> SH -> Acct)
- [x] Implement SH edit permission logic (`canEdit` when status is `approved_by_hr`)
- [x] Auto-generate bill numbers (`{BranchCode}-TA-{Year}-{Seq}`)
- [x] Add notification and audit trail support (`BillApproval` audit trail)

**Frontend Changes:**
- [x] Create bill creation screen (`src/screens/NewBillScreen.js`)
- [x] Create bill approval queue screen (`src/screens/BillApprovalScreen.js`)
- [x] Create SH bill editing screen (`src/screens/EditBillAmountsScreen.js`)
- [x] Create bill history/trail screen (`src/screens/BillDetailScreen.js`)
- [x] Add bill notifications and badge alerts (`src/screens/*DashboardScreen.js`)

---

### Phase 4: Attendance System ✅

**Database Changes:**
- [x] Create Attendance model (`backend/models/Attendance.js`)
- [x] Add unique index on employee + date (`backend/models/Attendance.js`)

**Backend Changes:**
- [x] Create attendanceController.js (`backend/controllers/attendanceController.js`)
- [x] Create attendanceRoutes.js (`backend/routes/attendanceRoutes.js`)
- [x] Implement cut-off time logic (09:30 AM branch cutoff checking)
- [x] Implement bulk approve for HR (`POST /api/attendance/bulk-approve`)
- [x] Implement record locking after approval (`isLocked: true`)
- [x] Add attendance report generation (`GET /api/attendance/report` & `GET /api/reports/attendance`)

**Frontend Changes:**
- [x] Create daily attendance marking screen (`src/screens/AttendanceScreen.js`)
- [x] Create HR attendance review screen with bulk approve (`src/screens/HRAttendanceScreen.js`)
- [x] Create attendance calendar/history view (`src/screens/AttendanceHistoryScreen.js`)
- [x] Create attendance reports & analytics (`src/screens/HRAttendanceScreen.js`, `src/screens/HRDashboardScreen.js`)
- [x] Add attendance summary to dashboard (`src/screens/HRDashboardScreen.js`, `src/screens/BranchManagerDashboardScreen.js`, `src/screens/DashboardScreen.js`)

---

---

## 11. Migration Strategy

### Existing Data Migration Plan

**Step 1: Create Branches**

```javascript
db.branches.insertMany([
  { name: "Indore Branch",   code: "BR01", city: "Indore" },
  { name: "Bhopal Branch",   code: "BR02", city: "Bhopal" },
  { name: "Jabalpur Branch", code: "BR03", city: "Jabalpur" },
  { name: "Ujjain Branch",   code: "BR04", city: "Ujjain" },
  { name: "Dewas Branch",    code: "BR05", city: "Dewas" }
]);
```

**Step 2: Assign existing users to Indore branch**

```javascript
// All current users belong to Indore (the only branch that exists today)
db.users.updateMany(
  { branch: { $exists: false } },
  { $set: { branch: ObjectId("BR01_ID") } }
);
```

**Step 3: Rename existing roles**

```javascript
db.users.updateMany(
  { role: "engineer" },
  { $set: { role: "service_engineer" } }
);
db.users.updateMany(
  { role: "admin" },
  { $set: { role: "super_admin" } }
);
```

**Step 4: Assign existing trips to Indore branch**

```javascript
db.trips.updateMany(
  { branch: { $exists: false } },
  { $set: { branch: ObjectId("BR01_ID") } }
);
```

**Step 5: Create default users for new branches**

```javascript
// For each new branch (BR02-BR05), create:
// - 1 Branch Manager
// - 1 HR staff member
// (Service Head + Account Dept are HQ-level, shared)
```

### Environment Variables

```bash
# Existing keep
MONGODB_URI=mongodb://localhost:27017/innoset
JWT_SECRET=your-secret-key

# New
DEFAULT_BRANCH_CODE=BR01
ATTENDANCE_CUTOFF_HOUR=9
ATTENDANCE_CUTOFF_MINUTE=30
SUPER_ADMIN_EMAIL=admin@innoset.com
```

---

> **Document Version:** 4.0
> **Date:** September 4, 2026
> **Author:** InnoSet Dev Team
> **Status:** Implementation Complete & Production Ready
