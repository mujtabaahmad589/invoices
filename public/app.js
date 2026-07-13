let allData = [];
let teamMembers = [];
let currentFilter = 'ALL';

document.addEventListener("DOMContentLoaded", function () {
    checkAuthStatus();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const contractForm = document.getElementById('contractForm');
    if (contractForm) contractForm.addEventListener('submit', handleFormSubmit);

    const addMemberForm = document.getElementById('addMemberForm');
    if (addMemberForm) addMemberForm.addEventListener('submit', handleAddMemberSubmit);
});

// حماية عامة: يمنع الضغط المزدوج على جميع نماذج الموقع
document.addEventListener('submit', function (e) {
    // تحديد زر الإرسال داخل النموذج الذي تم الضغط عليه
    const submitBtn = e.target.querySelector('button[type="submit"], input[type="submit"]');

    if (submitBtn) {
        // إذا كان الزر معطلاً بالفعل، نمنع إرسال النموذج مجدداً
        if (submitBtn.disabled) {
            e.preventDefault();
            return false;
        }

        // تعطيل الزر فوراً
        submitBtn.disabled = true;

        // إعادة تفعيل الزر تلقائياً بعد ثانيتين (أو بعد اكتمال الطلب)
        setTimeout(() => {
            submitBtn.disabled = false;
        }, 2000);
    }
});

async function checkAuthStatus() {
    try {
        const res = await fetch('/api/check-auth?t=' + new Date().getTime());
        const data = await res.json();

        if (data.isLoggedIn) {
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('app-section').style.display = 'block';
            
            const purchaseInput = document.getElementById('purchaseDate');
            if (purchaseInput) purchaseInput.value = new Date().toISOString().split('T')[0];
            
            loadData();
            loadTeamMembers();
        } else {
            document.getElementById('login-section').style.display = 'block';
            document.getElementById('app-section').style.display = 'none';
        }
    } catch (err) {
        console.error('خطأ في فحص الجلسة:', err);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value;
    const p = document.getElementById('loginPassword').value;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
    });

    if (res.ok) {
        checkAuthStatus();
    } else {
        const data = await res.json();
        Swal.fire('خطأ', data.error || 'تعذر تسجيل الدخول', 'error');
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    checkAuthStatus();
}

function switchTab(tabName) {
    const contractsPage = document.getElementById('page-contracts');
    const teamPage = document.getElementById('page-team');
    const tabContracts = document.getElementById('tab-contracts');
    const tabTeam = document.getElementById('tab-team');

    if (tabName === 'contracts') {
        contractsPage.style.display = 'block';
        teamPage.style.display = 'none';
        tabContracts.classList.add('active');
        tabTeam.classList.remove('active');
    } else {
        contractsPage.style.display = 'none';
        teamPage.style.display = 'block';
        tabTeam.classList.add('active');
        tabContracts.classList.remove('active');
        renderTeamReports();
    }
}

async function loadTeamMembers() {
    try {
        const res = await fetch('/api/team-members?t=' + new Date().getTime(), { cache: 'no-store' });
        teamMembers = await res.json();
        populateSelectDropdowns();
    } catch (err) {
        console.error('خطأ في جلب أعضاء الفريق:', err);
    }
}

function populateSelectDropdowns() {
    const agentSelect = document.getElementById('agentSelect');
    const coordinatorSelect = document.getElementById('coordinatorSelect');

    if (agentSelect) {
        agentSelect.innerHTML = '<option value="">-- بدون مندوب --</option>';
        teamMembers.filter(m => m.type === 'AGENT').forEach(m => {
            agentSelect.innerHTML += '<option value="' + m.name + '" data-rate="' + m.default_rate + '">' + m.name + '</option>';
        });
    }

    if (coordinatorSelect) {
        coordinatorSelect.innerHTML = '<option value="">-- بدون منسق/ة --</option>';
        teamMembers.filter(m => m.type === 'COORDINATOR').forEach(m => {
            coordinatorSelect.innerHTML += '<option value="' + m.name + '" data-rate="' + m.default_rate + '">' + m.name + '</option>';
        });
    }
}

function updateDefaultRate(type) {
    if (type === 'agent') {
        const select = document.getElementById('agentSelect');
        const rateInput = document.getElementById('agentRate');
        const selectedOption = select.options[select.selectedIndex];
        rateInput.value = (selectedOption && selectedOption.dataset.rate) ? selectedOption.dataset.rate : '';
    } else if (type === 'coordinator') {
        const select = document.getElementById('coordinatorSelect');
        const rateInput = document.getElementById('coordinatorRate');
        const selectedOption = select.options[select.selectedIndex];
        rateInput.value = (selectedOption && selectedOption.dataset.rate) ? selectedOption.dataset.rate : '';
    }
}

async function handleAddMemberSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('memberName').value;
    const type = document.getElementById('memberType').value;
    const rate = parseFloat(document.getElementById('memberDefaultRate').value) || 0;

    const res = await fetch('/api/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, default_rate: rate })
    });

    if (res.ok) {
        Swal.fire({ icon: 'success', title: 'تمت الإضافة بنجاح!', timer: 1200, showConfirmButton: false });
        e.target.reset();
        await loadTeamMembers();
    } else {
        Swal.fire('خطأ', 'تعذر إضافة الموظف', 'error');
    }
}

async function loadData() {
    try {
        const res = await fetch('/api/data?t=' + new Date().getTime(), { cache: 'no-store' });
        const rows = await res.json();
        
        const contractsMap = {};
        rows.forEach(r => {
            if (!contractsMap[r.contract_id]) {
                contractsMap[r.contract_id] = {
                    contract_id: r.contract_id,
                    customer_name: r.customer_name,
                    customer_code: r.customer_code || '',
                    phone: r.phone,
                    total_amount: r.total_amount,
                    down_payment: r.down_payment,
                    paid_down_payment: r.paid_down_payment || 0,
                    purchase_date: r.purchase_date,
                    agent_name: r.agent_name || '',
                    agent_rate: r.agent_rate || 0,
                    coordinator_name: r.coordinator_name || '',
                    coordinator_rate: r.coordinator_rate || 0,
                    notes: r.notes || '',
                    installments: []
                };
            }
            if (r.installment_id) {
                contractsMap[r.contract_id].installments.push({
                    id: r.installment_id,
                    due_date: r.due_date,
                    amount: r.amount,
                    paid_amount: r.paid_amount || 0,
                    status: r.status
                });
            }
        });

        allData = Object.values(contractsMap);
        applyFilterAndSearch();
        renderTeamReports();
    } catch (err) {
        console.error('خطأ في جلب البيانات:', err);
    }
}

function renderTeamReports() {
    const agentsMap = {};
    const coordinatorsMap = {};

    allData.forEach(c => {
        const total = parseFloat(c.total_amount) || 0;

        if (c.agent_name && c.agent_name.trim() !== '') {
            const name = c.agent_name.trim();
            const comm = (total * (parseFloat(c.agent_rate) || 0)) / 100;
            if (!agentsMap[name]) agentsMap[name] = { count: 0, totalSales: 0, totalCommission: 0 };
            agentsMap[name].count += 1;
            agentsMap[name].totalSales += total;
            agentsMap[name].totalCommission += comm;
        }

        if (c.coordinator_name && c.coordinator_name.trim() !== '') {
            const name = c.coordinator_name.trim();
            const comm = (total * (parseFloat(c.coordinator_rate) || 0)) / 100;
            if (!coordinatorsMap[name]) coordinatorsMap[name] = { count: 0, totalSales: 0, totalCommission: 0 };
            coordinatorsMap[name].count += 1;
            coordinatorsMap[name].totalSales += total;
            coordinatorsMap[name].totalCommission += comm;
        }
    });

    const agentsTbody = document.getElementById('agentsTableBody');
    if (agentsTbody) {
        agentsTbody.innerHTML = '';
        const keys = Object.keys(agentsMap);
        if (keys.length === 0) {
            agentsTbody.innerHTML = '<tr><td colspan="4" class="text-muted p-3">لا يوجد عقود مسجلة لمناديب.</td></tr>';
        } else {
            keys.forEach(name => {
                const item = agentsMap[name];
                agentsTbody.innerHTML += '<tr><td class="fw-bold">' + name + '</td><td><span class="badge bg-secondary">' + item.count + ' عقود</span></td><td>' + item.totalSales.toFixed(2) + ' ريال</td><td class="fw-bold text-success">' + item.totalCommission.toFixed(2) + ' ريال</td></tr>';
            });
        }
    }

    const coordsTbody = document.getElementById('coordinatorsTableBody');
    if (coordsTbody) {
        coordsTbody.innerHTML = '';
        const keys = Object.keys(coordinatorsMap);
        if (keys.length === 0) {
            coordsTbody.innerHTML = '<tr><td colspan="4" class="text-muted p-3">لا يوجد عقود مسجلة لمنسقات.</td></tr>';
        } else {
            keys.forEach(name => {
                const item = coordinatorsMap[name];
                coordsTbody.innerHTML += '<tr><td class="fw-bold">' + name + '</td><td><span class="badge bg-secondary">' + item.count + ' عقود</span></td><td>' + item.totalSales.toFixed(2) + ' ريال</td><td class="fw-bold text-success">' + item.totalCommission.toFixed(2) + ' ريال</td></tr>';
            });
        }
    }
}

function setFilter(filterType, btnElement) {
    currentFilter = filterType;
    
    // إزالة الفاعلية من كافة الأزرار
    const buttons = document.querySelectorAll('#filterGroup .btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // إعطاء زر التفعيل للزر المختار حالياً
    btnElement.classList.add('active');
    applyFilterAndSearch();
}

function applyFilterAndSearch() {
    const searchInput = document.getElementById('searchInput');
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filtered = allData.filter(c => {
        const matchesSearch = c.customer_name.toLowerCase().includes(q) || 
                              c.phone.toLowerCase().includes(q) || 
                              c.customer_code.toLowerCase().includes(q);
        
        const downPayment = parseFloat(c.down_payment) || 0;
        const paidDown = parseFloat(c.paid_down_payment) || 0;
        const isDownPaid = paidDown >= downPayment && downPayment > 0;

        const hasPendingInstallments = c.installments.some(i => i.status !== 'PAID');

        let matchesFilter = true;
        if (currentFilter === 'UNPAID_DOWN') matchesFilter = !isDownPaid;
        else if (currentFilter === 'PAID_DOWN_HAS_INST') matchesFilter = isDownPaid && hasPendingInstallments;
        else if (currentFilter === 'COMPLETELY_PAID') matchesFilter = isDownPaid && !hasPendingInstallments;

        return matchesSearch && matchesFilter;
    });

    renderCustomers(filtered);
}

function renderCustomers(data) {
    const container = document.getElementById('customersContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-light text-center border">لا يوجد عملاء يطابقون خيارات الفلترة أو البحث.</div>';
        return;
    }

    data.forEach(c => {
        const collapseId = "collapseContract_" + c.contract_id;
        
        const totalAmount = parseFloat(c.total_amount) || 0;
        const downPayment = parseFloat(c.down_payment) || 0;
        const paidDown = parseFloat(c.paid_down_payment) || 0;
        const remainingDown = Math.max(0, downPayment - paidDown);

        const isDownPaid = remainingDown <= 0;
        const paidInstsCount = (isDownPaid ? 1 : 0) + c.installments.filter(i => i.status === 'PAID').length;
        const totalInstsCount = 1 + c.installments.length;
        const progress = totalInstsCount > 0 ? Math.round((paidInstsCount / totalInstsCount) * 100) : 0;

        const agentCommission = (totalAmount * (parseFloat(c.agent_rate) || 0) / 100).toFixed(2);
        const coordCommission = (totalAmount * (parseFloat(c.coordinator_rate) || 0) / 100).toFixed(2);

        let instRows = '';
        
        // #1 الدفعة الأولى (مع إضافة تاريخ الشراء بالجدول)
        const downBadge = isDownPaid 
            ? '<span class="badge bg-success">تم السداد</span>' 
            : '<span class="badge bg-warning text-dark">متبقي ' + remainingDown.toFixed(2) + ' ريال</span>';

        const downAction = isDownPaid 
            ? '<button class="btn btn-sm btn-secondary py-0 px-2" disabled>تم السداد</button>' 
            : '<button class="btn btn-sm btn-success py-0 px-2" onclick="payDownPayment(' + c.contract_id + ', ' + remainingDown + ')">تكملة السداد</button>';

        const downWhatsappMsg = encodeURIComponent('مرحباً ' + c.customer_name + '، نود تذكيركم بالمتبقي من الدفعة الأولى بمبلغ ' + remainingDown.toFixed(2) + ' ريال');
        const downWhatsapp = '<a href="https://wa.me/' + c.phone + '?text=' + downWhatsappMsg + '" target="_blank" class="btn btn-sm btn-outline-success py-0 px-2 ms-1">واتساب</a>';

        instRows += '<tr class="table-light">' +
            '<td><strong>#1 (الدفعة الأولى)</strong></td>' +
            '<td>' + (c.purchase_date || 'تاريخ الشراء') + '</td>' +
            '<td>' + downPayment.toFixed(2) + ' ريال <small class="text-muted">(مدفوع: ' + paidDown.toFixed(2) + ')</small></td>' +
            '<td>' + downBadge + '</td>' +
            '<td>' + downAction + ' ' + (!isDownPaid ? downWhatsapp : '') + '</td>' +
            '</tr>';

        // الأقساط الشهريّة (#2 وما بعدها)
        c.installments.forEach((inst, idx) => {
            const instAmount = parseFloat(inst.amount);
            const paidAmount = parseFloat(inst.paid_amount) || 0;
            const remainingInst = Math.max(0, instAmount - paidAmount);
            const isPaid = inst.status === 'PAID' || remainingInst <= 0;

            let statusBadge = '';
            let payBtn = '';

            if (isPaid) {
                statusBadge = '<span class="badge bg-success">تم السداد</span>';
                payBtn = '<button class="btn btn-sm btn-secondary py-0 px-2" disabled>تم السداد</button>';
            } else if (paidAmount > 0) {
                statusBadge = '<span class="badge bg-warning text-dark">متبقي ' + remainingInst.toFixed(2) + ' ريال</span>';
                payBtn = '<button class="btn btn-sm btn-success py-0 px-2" onclick="payInstallment(' + inst.id + ', ' + remainingInst + ', ' + instAmount + ', ' + paidAmount + ')">تكملة السداد</button>';
            } else {
                statusBadge = '<span class="badge bg-warning text-dark">مستحق</span>';
                payBtn = '<button class="btn btn-sm btn-primary py-0 px-2" onclick="payInstallment(' + inst.id + ', ' + remainingInst + ', ' + instAmount + ', 0)">تسديد</button>';
            }

            const whatsappMsg = encodeURIComponent('مرحباً ' + c.customer_name + '، نود تذكيركم بموعد القسط رقم ' + (idx + 2) + ' بمبلغ ' + remainingInst.toFixed(2) + ' ريال بتاريخ ' + inst.due_date);
            const whatsappBtn = '<a href="https://wa.me/' + c.phone + '?text=' + whatsappMsg + '" target="_blank" class="btn btn-sm btn-outline-success py-0 px-2 ms-1">واتساب</a>';

            const amountDisplay = instAmount.toFixed(2) + ' ريال' + (paidAmount > 0 ? ' <small class="text-muted">(مدفوع: ' + paidAmount.toFixed(2) + ')</small>' : '');

            instRows += '<tr>' +
                '<td>#' + (idx + 2) + '</td>' +
                '<td>' + inst.due_date + '</td>' +
                '<td>' + amountDisplay + '</td>' +
                '<td>' + statusBadge + '</td>' +
                '<td>' + payBtn + ' ' + whatsappBtn + '</td>' +
                '</tr>';
        });

        let teamInfoHtml = '';
        if (c.agent_name || c.coordinator_name) {
            teamInfoHtml += '<div class="row bg-light p-2 rounded mb-2 fs-7 align-items-center text-secondary" style="font-size:0.82rem;">';
            if (c.agent_name) {
                teamInfoHtml += '<div class="col-md-6">👤 <strong>المندوب:</strong> ' + c.agent_name + ' (' + c.agent_rate + '%) | <span class="text-success fw-bold">العمولة: ' + agentCommission + ' ريال</span></div>';
            }
            if (c.coordinator_name) {
                teamInfoHtml += '<div class="col-md-6">🎧 <strong>المنسق/ة:</strong> ' + c.coordinator_name + ' (' + c.coordinator_rate + '%) | <span class="text-success fw-bold">العمولة: ' + coordCommission + ' ريال</span></div>';
            }
            teamInfoHtml += '</div>';
        }

        let notesHtml = c.notes ? '<div class="alert alert-warning py-1 px-2 mb-2 text-dark" style="font-size:0.83rem;">📌 <strong>ملاحظات العقد:</strong> ' + c.notes + '</div>' : '';

        // تفاصيل شريط العميل (اسم العميل فقط بجانب السهم)
        const codeDisplay = c.customer_code ? ' | كود: ' + c.customer_code : '';
        const card = document.createElement('div');
        card.className = 'customer-row';
        card.innerHTML = '<div class="d-flex justify-content-between align-items-center">' +
            '<div class="d-flex align-items-center gap-3">' +
                '<button class="arrow-btn" type="button" data-bs-toggle="collapse" data-bs-target="#' + collapseId + '">▼</button>' +
                '<div>' +
                    '<h6 class="mb-0 fw-bold text-dark d-inline-block">' + c.customer_name + '</h6>' +
                    (c.customer_code ? ' <span class="badge bg-light text-dark border ms-2">الكود: ' + c.customer_code + '</span>' : '') +
                '</div>' +
            '</div>' +
            '<div class="text-end">' +
                '<span class="badge bg-dark badge-pill">الإجمالي: ' + totalAmount.toFixed(2) + ' ريال</span>' +
                '<div class="small text-muted mt-1" style="font-size: 0.78rem;">سداد الدفعات: ' + paidInstsCount + '/' + totalInstsCount + ' (' + progress + '%)</div>' +
            '</div>' +
        '</div>' +
        '<div class="collapse mt-3" id="' + collapseId + '">' +
            '<div class="bg-light p-2 rounded mb-2 text-muted" style="font-size: 0.82rem;">' +
                '📱 <strong>الهاتف:</strong> ' + c.phone + ' | 📅 <strong>تاريخ الشراء:</strong> ' + (c.purchase_date || 'غير محدد') + codeDisplay + ' | 📝 <strong>عقد:</strong> #' + c.contract_id +
            '</div>' +
            teamInfoHtml +
            notesHtml +
            '<table class="table table-sm table-bordered text-center align-middle mb-0" style="font-size: 0.88rem;">' +
                '<thead class="table-dark">' +
                    '<tr>' +
                        '<th>الدفعّة</th>' +
                        '<th>تاريخ الاستحقاق</th>' +
                        '<th>القيمّة</th>' +
                        '<th>الحالة</th>' +
                        '<th>الإجراءات</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody>' + instRows + '</tbody>' +
            '</table>' +
        '</div>';
        
        container.appendChild(card);
    });
}

async function payInstallment(id, remaining, totalInstAmount, currentPaid) {
    const titleText = currentPaid > 0 ? 'تكملة سداد القسط الشهري' : 'تسديد القسط الشهري';
    const infoText = currentPaid > 0 
        ? 'المبلغ الإجمالي للقسط: ' + totalInstAmount.toFixed(2) + ' ريال | تم دفع: ' + currentPaid.toFixed(2) + ' ريال | المتبقي: ' + remaining.toFixed(2) + ' ريال'
        : 'المبلغ المستحق للقسط: ' + remaining.toFixed(2) + ' ريال';

    const { value: paidAmount } = await Swal.fire({
        title: titleText,
        text: infoText,
        input: 'number',
        inputLabel: 'المبلغ المدفوع الآن (ريال)',
        inputValue: remaining.toFixed(2),
        showCancelButton: true,
        confirmButtonText: 'تأكيد السداد',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#198754',
        inputValidator: (value) => {
            if (!value || parseFloat(value) <= 0) return 'يرجى إدخال مبلغ أكبر من الصفر!';
            if (parseFloat(value) > remaining) return 'المبلغ المدفوع أكبر من المتبقي (' + remaining.toFixed(2) + ' ريال)!';
        }
    });

    if (paidAmount) {
        const res = await fetch('/api/pay-installment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ installment_id: id, amount: parseFloat(paidAmount) })
        });
        if (res.ok) {
            Swal.fire({ icon: 'success', title: 'تم تسجيل السداد بنجاح! 🎉', timer: 1200, showConfirmButton: false });
            setTimeout(loadData, 200);
        }
    }
}

async function payDownPayment(contractId, remaining) {
    const { value: amount } = await Swal.fire({
        title: 'تكملة سداد الدفعة الأولى',
        text: 'المبلغ المتبقي من الدفعة الأولى هو ' + remaining.toFixed(2) + ' ريال',
        input: 'number',
        inputLabel: 'المبلغ المدفوع الآن',
        inputValue: remaining.toFixed(2),
        showCancelButton: true,
        confirmButtonText: 'تسديد الآن',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#198754',
        inputValidator: (value) => {
            if (!value || parseFloat(value) <= 0) return 'يرجى إدخال مبلغ أكبر من الصفر!';
            if (parseFloat(value) > remaining) return 'المبلغ أكبر من المتبقي (' + remaining.toFixed(2) + ' ريال)!';
        }
    });

    if (amount) {
        const res = await fetch('/api/pay-down-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contract_id: contractId, amount: parseFloat(amount) })
        });
        if (res.ok) {
            Swal.fire({ icon: 'success', title: 'تم تسديد مبلغ الدفعة بنجاح! 🎉', timer: 1200, showConfirmButton: false });
            setTimeout(loadData, 200);
        }
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const downVal = parseFloat(document.getElementById('downPayment').value) || 0;
    const paidDownVal = parseFloat(document.getElementById('paidDownPayment').value) || 0;

    if (downVal <= 0 || paidDownVal <= 0) {
        Swal.fire('تنبيه', 'يجب أن تكون قيمة الدفعة الأولى والمدفوع منها أكبر من الصفر!', 'warning');
        return;
    }

    if (paidDownVal > downVal) {
        Swal.fire('تنبيه', 'المبلغ المدفوع لا يمكن أن يكون أكبر من قيمة الدفعة الأولى نفسها!', 'warning');
        return;
    }

    const data = {
        customer_name: document.getElementById('custName').value,
        customer_code: document.getElementById('custCode').value,
        phone: document.getElementById('custPhone').value,
        purchase_date: document.getElementById('purchaseDate').value,
        total_amount: document.getElementById('totalAmount').value,
        down_payment: downVal,
        paid_down_payment: paidDownVal,
        installments_count: document.getElementById('instCount').value,
        start_date: document.getElementById('startDate').value,
        agent_name: document.getElementById('agentSelect').value,
        agent_rate: parseFloat(document.getElementById('agentRate').value) || 0,
        coordinator_name: document.getElementById('coordinatorSelect').value,
        coordinator_rate: parseFloat(document.getElementById('coordinatorRate').value) || 0,
        notes: document.getElementById('notes').value
    };

    const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        Swal.fire({ icon: 'success', title: 'تم حفظ العقد بنجاح!', timer: 1200, showConfirmButton: false });
        e.target.reset();
        document.getElementById('purchaseDate').value = new Date().toISOString().split('T')[0];
        setTimeout(loadData, 250);
    } else {
        const errData = await res.json();
        Swal.fire('خطأ', errData.error || 'تعذر حفظ العقد', 'error');
    }
}