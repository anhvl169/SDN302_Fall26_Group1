const Shop = require("./shop.model.js");
const AppError = require("../../common/errors/AppError.js");
const { assertObjectId } = require("../../common/utils/query.js");
const { getActiveCategories } = require("../categories/category.service.js");
const { VISIBLE_SHOP } = require("../products/product.service.js");

// shop đang hiển thị cho khách, bị khóa (SUSPENDED) hoặc đóng cửa (CLOSED) thì 404
const findVisibleShop = async (shopId) => {
  assertObjectId(shopId, "shopId");
  const shop = await Shop.findOne({ _id: shopId, ...VISIBLE_SHOP }).select(
    "shopName address phone logoUrl bannerUrl operationStatus createdAt",
  );
  if (!shop) {
    throw new AppError(404, "Shop không tồn tại hoặc đang tạm ngưng hoạt động");
  }
  return shop;
};

// UC28 - trang shop: thông tin shop + danh mục ACTIVE
// sản phẩm của shop lấy qua GET /api/products?shopId=
const getShopPage = async (shopId) => {
  const shop = await findVisibleShop(shopId);
  const categories = await getActiveCategories(shop._id);
  return { shop, categories };
};

// UC28 - danh mục ACTIVE của shop
const getShopCategories = async (shopId) => {
  const shop = await findVisibleShop(shopId);
  return getActiveCategories(shop._id);
};

const validateId = (id, field = "ID") => {
  if (!mongoose.isObjectIdOrHexString(id)) {
    throw new AppError(400, `${field} không hợp lệ`);
  }
};

const getBody = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(400, "Body phải là một object JSON");
  }

  return body;
};

const text = (
  value,
  field,
  { required = false, max = 1000 } = {},
) => {
  if (value === undefined) {
    if (required) {
      throw new AppError(400, `${field} không được để trống`);
    }

    return undefined;
  }

  if (typeof value !== "string") {
    throw new AppError(400, `${field} phải là chuỗi`);
  }

  const result = value.trim();

  if (required && !result) {
    throw new AppError(400, `${field} không được để trống`);
  }

  if (result.length > max) {
    throw new AppError(400, `${field} tối đa ${max} ký tự`);
  }

  return result;
};

const enumValue = (value, values, field) => {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new AppError(
      400,
      `${field} chỉ chấp nhận: ${values.join(", ")}`,
    );
  }

  return value;
};

const positiveInteger = (value, fallback, field, max) => {
  if (value === undefined) return fallback;

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new AppError(400, `${field} phải là số nguyên dương`);
  }

  const result = Number(value);

  if (!Number.isSafeInteger(result) || result > max) {
    throw new AppError(400, `${field} tối đa ${max}`);
  }

  return result;
};

const getPagination = (query = {}) => {
  const page = positiveInteger(query.page, 1, "page", 1000000);
  const limit = positiveInteger(query.limit, 10, "limit", 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const optionalEnum = (value, values, field) => {
  if (value === undefined) return undefined;
  return enumValue(value, values, field);
};

const validateImageUrl = (value, field) => {
  const result = text(value, field, { max: 2048 });

  // Cho phép chuỗi rỗng để xóa ảnh hiện tại.
  if (result === undefined || result === "") return result;

  try {
    const url = new URL(result);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    throw new AppError(400, `${field} phải là URL HTTP/HTTPS hợp lệ`);
  }

  return result;
};

const transaction = async (callback) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      result = await callback(session);
    });

    return result;
  } finally {
    await session.endSession();
  }
};

const findOwnedShop = async (shopId, ownerId, session = null) => {
  validateId(shopId, "shopId");

  const shop = await Shop.findOne({
    _id: shopId,
    ownerId,
  }).session(session);

  if (!shop) {
    throw new AppError(
      404,
      "Không tìm thấy shop thuộc quyền quản lý của bạn",
    );
  }

  return shop;
};

const findPendingRequest = async (requestId, session) => {
  validateId(requestId, "requestId");

  const request = await ShopRegistrationRequest.findById(
    requestId,
  ).session(session);

  if (!request) {
    throw new AppError(404, "Không tìm thấy yêu cầu mở shop");
  }

  if (request.status !== "PENDING") {
    throw new AppError(409, "Yêu cầu này đã được xử lý");
  }

  return request;
};

// ---------- UC12 ----------

const registrationRequest = async (customerId, input) => {
  const body = getBody(input);

  const shopName = text(body.shopName, "Tên shop", {
    required: true,
    max: 150,
  });

  const description = text(body.description, "Mô tả", {
    max: 3000,
  });

  return transaction(async (session) => {
    // Cập nhật timestamp của user để tuần tự hóa các thao tác
    // đăng ký shop / chuyển role cùng tác động lên user này.
    const customer = await User.findOneAndUpdate(
      {
        _id: customerId,
        role: "CUSTOMER",
        accountStatus: "ACTIVE",
      },
      { $set: { updatedAt: new Date() } },
      { new: true, session },
    ).select("_id fullName");

    if (!customer) {
      throw new AppError(
        403,
        "Chỉ tài khoản CUSTOMER đang hoạt động được gửi yêu cầu",
      );
    }

    const existingShop = await Shop.exists({
      ownerId: customerId,
    }).session(session);

    if (existingShop) {
      throw new AppError(409, "Bạn đã có shop");
    }

    const pendingRequest = await ShopRegistrationRequest.exists({
      customerId,
      status: "PENDING",
    }).session(session);

    if (pendingRequest) {
      throw new AppError(409, "Bạn đang có yêu cầu chờ duyệt");
    }

    const [request] = await ShopRegistrationRequest.create(
      [
        {
          customerId,
          shopName,
          description,
          status: "PENDING",
        },
      ],
      { session },
    );

    const admins = await User.find({
      role: "ADMIN",
      accountStatus: "ACTIVE",
    })
      .select("_id")
      .session(session)
      .lean();

    if (admins.length > 0) {
      await Notification.insertMany(
        admins.map((admin) => ({
          receiverId: admin._id,
          title: "Có yêu cầu mở shop mới",
          message:
            `${customer.fullName} gửi yêu cầu mở shop "${shopName}".`,
          type: "SHOP_REGISTRATION",
        })),
        { session },
      );
    }

    return request;
  });
};

// ---------- UC13 ----------

const getRegistrationRequest = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);

  const status = optionalEnum(
    query.status,
    REQUEST_STATUSES,
    "status",
  );

  const filter = {};
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    ShopRegistrationRequest.find(filter)
      .populate("customerId", "fullName email phone")
      .populate("reviewedBy", "fullName email")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    ShopRegistrationRequest.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total },
  };
};

// ---------- UC14 ----------

const approveRegisterRequest = async (requestId, adminId) => {
  return transaction(async (session) => {
    const request = await findPendingRequest(requestId, session);

    const existingShop = await Shop.exists({
      ownerId: request.customerId,
    }).session(session);

    if (existingShop) {
      throw new AppError(409, "Người gửi yêu cầu đã có shop");
    }

    const customer = await User.findOneAndUpdate(
      {
        _id: request.customerId,
        role: "CUSTOMER",
        accountStatus: "ACTIVE",
      },
      { $set: { role: "SHOP_OWNER" } },
      { new: true, session, runValidators: true },
    ).select("_id fullName email role");

    if (!customer) {
      throw new AppError(
        409,
        "Người gửi không còn là CUSTOMER đang hoạt động",
      );
    }

    const [shop] = await Shop.create(
      [
        {
          ownerId: request.customerId,
          shopName: request.shopName,
          approvalStatus: "APPROVED",
          operationStatus: "OPEN",
        },
      ],
      { session },
    );

    request.status = "APPROVED";
    request.reviewedBy = adminId;
    await request.save({ session });

    await Notification.create(
      [
        {
          receiverId: request.customerId,
          title: "Yêu cầu mở shop được duyệt",
          message:
            `Yêu cầu mở shop "${request.shopName}" đã được phê duyệt.`,
          type: "SHOP_REGISTRATION",
        },
      ],
      { session },
    );

    return { request, shop };
  });
};

// ---------- UC15 ----------

const rejectRegisterRequest = async (requestId, adminId, input) => {
  const body = getBody(input);

  const reason = text(body.reason, "Lý do từ chối", {
    required: true,
    max: 2000,
  });

  return transaction(async (session) => {
    const request = await findPendingRequest(requestId, session);

    request.status = "REJECTED";
    request.reviewedBy = adminId;
    await request.save({ session });

    await Notification.create(
      [
        {
          receiverId: request.customerId,
          title: "Yêu cầu mở shop bị từ chối",
          message:
            `Yêu cầu mở shop "${request.shopName}" bị từ chối. ` +
            `Lý do: ${reason}`,
          type: "SHOP_REGISTRATION",
        },
      ],
      { session },
    );

    return request;
  });
};

// ---------- UC16 ----------

const updateShopDetail = async (shopId, ownerId, input) => {
  const body = getBody(input);
  const changes = {};

  if (body.shopName !== undefined) {
    changes.shopName = text(body.shopName, "Tên shop", {
      required: true,
      max: 150,
    });
  }

  if (body.address !== undefined) {
    changes.address = text(body.address, "Địa chỉ", { max: 500 });
  }

  if (body.phone !== undefined) {
    const phone = text(body.phone, "Số điện thoại", { max: 20 });

    // Chấp nhận chuỗi rỗng để xóa SĐT.
    if (phone && !/^\+?[0-9]{9,15}$/.test(phone)) {
      throw new AppError(400, "Số điện thoại không hợp lệ");
    }

    changes.phone = phone;
  }

  if (body.logoUrl !== undefined) {
    changes.logoUrl = validateImageUrl(body.logoUrl, "logoUrl");
  }

  if (body.bannerUrl !== undefined) {
    changes.bannerUrl = validateImageUrl(body.bannerUrl, "bannerUrl");
  }

  if (Object.keys(changes).length === 0) {
    throw new AppError(400, "Không có thông tin hợp lệ để cập nhật");
  }

  validateId(shopId, "shopId");

  // Chỉ cập nhật các trường được phép.
  const shop = await Shop.findOneAndUpdate(
    { _id: shopId, ownerId },
    { $set: changes },
    { new: true, runValidators: true },
  );

  if (!shop) {
    throw new AppError(
      404,
      "Không tìm thấy shop thuộc quyền quản lý của bạn",
    );
  }

  return shop;
};

// ---------- UC17 ----------

const closeOrOpenShop = async (shopId, ownerId, input) => {
  const body = getBody(input);

  const operationStatus = enumValue(
    body.operationStatus,
    ["OPEN", "CLOSED"],
    "operationStatus",
  );

  validateId(shopId, "shopId");

  // Điều kiện APPROVED nằm ngay trong câu update:
  // không cho chủ shop mở lại shop đã bị Admin khóa.
  const filter = { _id: shopId, ownerId };

  if (operationStatus === "OPEN") {
    filter.approvalStatus = "APPROVED";
  }

  const shop = await Shop.findOneAndUpdate(
    filter,
    { $set: { operationStatus } },
    { new: true, runValidators: true },
  );

  if (!shop) {
    await findOwnedShop(shopId, ownerId);

    throw new AppError(
      409,
      "Chỉ shop đã được phê duyệt mới được mở cửa",
    );
  }

  return shop;
};

// ---------- UC18: Danh sách nhân viên ----------

const viewShopStaff = async (shopId, ownerId, query = {}) => {
  await findOwnedShop(shopId, ownerId);

  const { page, limit, skip } = getPagination(query);
  const role = optionalEnum(query.role, STAFF_ROLES, "role");

  const filter = { shopId };
  if (role) filter.role = role;

  const [items, total] = await Promise.all([
    ShopStaff.find(filter)
      .populate("userId", "fullName email phone role accountStatus")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    ShopStaff.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total },
  };
};

// ---------- UC18: Thêm nhân viên ----------

const addShopStaff = async (shopId, ownerId, input) => {
  const body = getBody(input);

  const email = text(body.email, "Email", {
    required: true,
    max: 254,
  }).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, "Email không hợp lệ");
  }

  const role = enumValue(body.role, STAFF_ROLES, "role");

  return transaction(async (session) => {
    await findOwnedShop(shopId, ownerId, session);

    const user = await User.findOne({ email })
      .select("_id role accountStatus")
      .session(session);

    if (!user) {
      throw new AppError(404, "Không tìm thấy tài khoản có email này");
    }

    if (user.role !== "CUSTOMER" || user.accountStatus !== "ACTIVE") {
      throw new AppError(
        409,
        "Chỉ có thể thêm tài khoản CUSTOMER đang hoạt động",
      );
    }

    const membership = await ShopStaff.exists({
      userId: user._id,
    }).session(session);

    if (membership) {
      throw new AppError(409, "Tài khoản đã là nhân viên của một shop");
    }

    const pendingRequest = await ShopRegistrationRequest.exists({
      customerId: user._id,
      status: "PENDING",
    }).session(session);

    if (pendingRequest) {
      throw new AppError(
        409,
        "Tài khoản đang có yêu cầu mở shop chờ duyệt",
      );
    }

    const existingShop = await Shop.exists({
      ownerId: user._id,
    }).session(session);

    if (existingShop) {
      throw new AppError(409, "Tài khoản đã sở hữu shop");
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        role: "CUSTOMER",
        accountStatus: "ACTIVE",
      },
      { $set: { role: "STAFF" } },
      { new: true, session, runValidators: true },
    ).select("_id");

    if (!updatedUser) {
      throw new AppError(
        409,
        "Tài khoản không còn đủ điều kiện làm nhân viên",
      );
    }

    const [staff] = await ShopStaff.create(
      [{ shopId, userId: user._id, role }],
      { session },
    );

    await staff.populate({
      path: "userId",
      select: "fullName email phone role accountStatus",
      options: { session },
    });

    return staff;
  });
};

// ---------- UC18: Đổi nhiệm vụ ----------

const updateShopStaff = async (
  shopId,
  staffId,
  ownerId,
  input,
) => {
  const body = getBody(input);
  const role = enumValue(body.role, STAFF_ROLES, "role");

  validateId(staffId, "staffId");
  await findOwnedShop(shopId, ownerId);

  const staff = await ShopStaff.findOneAndUpdate(
    { _id: staffId, shopId },
    { $set: { role } },
    { new: true, runValidators: true },
  ).populate("userId", "fullName email phone role accountStatus");

  if (!staff) {
    throw new AppError(404, "Không tìm thấy nhân viên trong shop");
  }

  return staff;
};

// ---------- UC18: Xóa nhân viên ----------

const deleteShopStaff = async (shopId, staffId, ownerId) => {
  validateId(staffId, "staffId");

  return transaction(async (session) => {
    await findOwnedShop(shopId, ownerId, session);

    const staff = await ShopStaff.findOneAndDelete({
      _id: staffId,
      shopId,
    }).session(session);

    if (!staff) {
      throw new AppError(404, "Không tìm thấy nhân viên trong shop");
    }

    // Chỉ trả về CUSTOMER khi không còn membership nào khác.
    const remainingMembership = await ShopStaff.exists({
      userId: staff.userId,
    }).session(session);

    if (!remainingMembership) {
      const user = await User.findOneAndUpdate(
        { _id: staff.userId, role: "STAFF" },
        { $set: { role: "CUSTOMER" } },
        { new: true, session, runValidators: true },
      ).select("_id");

      if (!user) {
        throw new AppError(
          409,
          "Dữ liệu tài khoản nhân viên không nhất quán",
        );
      }
    }

    return {
      staffId: staff._id,
      userId: staff.userId,
      shopId: staff.shopId,
    };
  });
};

// ---------- UC19: Danh sách shop ----------

const getShops = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);

  const approvalStatus = optionalEnum(
    query.approvalStatus,
    APPROVAL_STATUSES,
    "approvalStatus",
  );

  const operationStatus = optionalEnum(
    query.operationStatus,
    ["OPEN", "CLOSED"],
    "operationStatus",
  );

  const filter = {};

  if (approvalStatus) filter.approvalStatus = approvalStatus;
  if (operationStatus) filter.operationStatus = operationStatus;

  const [items, total] = await Promise.all([
    Shop.find(filter)
      .populate("ownerId", "fullName email phone accountStatus")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Shop.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total },
  };
};

// ---------- UC19: Khóa / mở lại ----------

const lockOrUnlockShop = async (shopId, input) => {
  validateId(shopId, "shopId");

  const body = getBody(input);

  const approvalStatus = enumValue(
    body.approvalStatus,
    ["SUSPENDED", "APPROVED"],
    "approvalStatus",
  );

  const previousStatus =
    approvalStatus === "SUSPENDED" ? "APPROVED" : "SUSPENDED";

  const shop = await Shop.findOneAndUpdate(
    {
      _id: shopId,
      approvalStatus: previousStatus,
    },
    { $set: { approvalStatus } },
    { new: true, runValidators: true },
  );

  if (!shop) {
    const existingShop = await Shop.findById(shopId).select(
      "approvalStatus",
    );

    if (!existingShop) {
      throw new AppError(404, "Không tìm thấy shop");
    }

    throw new AppError(
      409,
      `Không thể chuyển trạng thái từ ` +
      `${existingShop.approvalStatus} sang ${approvalStatus}`,
    );
  }

  return shop;
};

// ---------- UC20 ----------

const shopSystemReport = async (query = {}) => {
  const currentYear = Number(
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date()),
  );

  const year = positiveInteger(
    query.year,
    currentYear,
    "year",
    9999,
  );

  if (year < 2000) {
    throw new AppError(400, "year phải từ 2000 đến 9999");
  }

  // Đầu năm theo giờ Việt Nam, chuyển sang UTC.
  const startDate = new Date(
    `${year}-01-01T00:00:00+07:00`,
  );

  const endDate = new Date(startDate);
  endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);

  const [totalUsers, totalShops, totalOrders, revenueRows] =
    await Promise.all([
      User.countDocuments(),
      Shop.countDocuments(),
      Order.countDocuments(),

      Order.aggregate([
        {
          $match: {
            orderStatus: "DELIVERED",
            paymentStatus: "PAID",
            createdAt: {
              $gte: startDate,
              $lt: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $month: {
                date: "$createdAt",
                timezone: "Asia/Ho_Chi_Minh",
              },
            },
            revenue: { $sum: "$totalAmount" },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

  const revenueMap = new Map(
    revenueRows.map((row) => [row._id, row]),
  );

  const monthlyRevenue = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const row = revenueMap.get(month);

    return {
      month,
      revenue: row?.revenue ?? 0,
      orderCount: row?.orderCount ?? 0,
    };
  });

  return {
    totalUsers,
    totalShops,
    totalOrders,
    year,
    totalRevenue: monthlyRevenue.reduce(
      (sum, item) => sum + item.revenue,
      0,
    ),
    monthlyRevenue,
  };
};

module.exports = {
  getShopPage, getShopCategories, registrationRequest,
  getRegistrationRequest,
  approveRegisterRequest,
  rejectRegisterRequest,
  updateShopDetail,
  closeOrOpenShop,
  viewShopStaff,
  addShopStaff,
  updateShopStaff,
  deleteShopStaff,
  getShops,
  lockOrUnlockShop,
  shopSystemReport,
};
