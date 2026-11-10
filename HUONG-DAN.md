# Quản Lý Cửa Hàng — hướng dẫn nhanh

## Mở app
Mở đường link app bằng Chrome (Android) hoặc Safari (iPhone). Nếu nhận link qua Zalo, bấm dấu ⋮ → "Mở bằng trình duyệt" — mở ngay trong Zalo thì đăng nhập Google có thể không thành công.

## Lần đầu mở — đăng nhập
Mở app là gặp màn hình đăng nhập, 2 cách vào:
- **Tự tạo tài khoản**: bấm "Đăng nhập bằng Google", hoặc nhập email + mật khẩu rồi bấm "Đăng ký tài khoản mới".
- **Tài khoản admin cấp sẵn**: nhập email + mật khẩu được cấp rồi bấm "Đăng nhập".
Chỉ đăng nhập 1 lần trên mỗi máy — app tự ghi nhớ, lần sau mở là vào thẳng. Người đăng nhập đầu tiên là Chủ cửa hàng; chủ mời thêm người quản lý bằng email trong mục "☁️ Tài khoản & đồng bộ".

## Các mục chính
- **Tổng quan**: tổng nợ khách, tổng nợ nhà cung cấp, thu/chi hôm nay và tháng này + các cảnh báo (hết hàng, sắp hết hàng, sắp hết hạn, đã hết hạn).
- **Sản phẩm**: bấm ＋ Thêm sản phẩm — form có sẵn mục "Lô nhập đầu tiên", điền luôn số lượng + giá nhập + hạn dùng là nhập lô luôn một lượt. Một sản phẩm nhập nhiều lần thì vào chi tiết sản phẩm → ＋ Nhập thêm lô (mỗi lô 1 hạn dùng + giá nhập riêng). **Mã vạch**: mỗi loại sản phẩm có 1 mã vạch riêng — ở tab Sản phẩm bấm "Quét mã vạch" để tìm nhanh hàng đã có; khi thêm sản phẩm, cạnh ô Barcode có nút "Quét", quét là điền mã luôn (khỏi gõ 13 số). Nếu mã đó đã có trong kho, app báo ngay để mở sản phẩm cũ, không tạo trùng. Hàng mới quét xong app còn thử điền sẵn tên gợi ý (hàng nhập khẩu thường tra được; giá bán vẫn tự nhập).
- **Công nợ KH**: khách được xếp theo thôn (thôn thêm/sửa được ở nút 🏘 Quản lý thôn). Khi thêm khách mới, form có sẵn mục "Khoản nợ đầu tiên" để ghi luôn nếu khách mua nợ ngay; các khoản sau thì vào hồ sơ khách → ＋ Ghi khoản nợ mới. Khách trả tiền → bấm "Ghi trả nợ" ngay trong khoản nợ đó, tiền tự chạy sang mục Thu chi, không cần nhập lại.
- **Nhà cung cấp**: vào hồ sơ → ＋ Thêm hoá đơn nhập (chụp ảnh hoá đơn). Trả tiền → bấm "Thanh toán" trong hoá đơn, tiền tự chạy sang mục Thu chi.
- **Thu chi**: chỉ nhập tay các khoản khác (điện nước, vận chuyển, thu khác...). Khoản nào ghi "Tự động từ công nợ..." là app tự tạo, không sửa ở đây.

## Xuất báo cáo Excel
Bấm nút **Xuất báo cáo Excel** (ở menu trái trên máy tính, nút **Excel** trên điện thoại, hoặc ngay trên khối xanh ở trang Tổng quan) — app tải về 1 file .xlsx gồm 9 trang:
Tổng quan · Sản phẩm · Lô hàng · Công nợ khách hàng · Lịch sử trả nợ · Khách hàng · Hoá đơn NCC · Thanh toán NCC · Thu chi.
Mỗi trang đều có dòng tiêu đề lớn, hàng tiêu đề cột tô màu + in đậm, cột tiền là số thật (cộng/sắp xếp trong Excel được), có sẵn dòng TỔNG ở cuối và đóng băng dòng tiêu đề khi cuộn. Khác với nút Sao lưu: file Excel để xem/gửi/báo cáo, file Sao lưu (.json) để khôi phục dữ liệu vào app.

## Sáng / tối
Nút 🌙 Tối / ☀️ Sáng ở góc trên — app nhớ lựa chọn cho lần sau.

## Rất quan trọng: sao lưu
Dữ liệu đồng bộ lên máy chủ theo tài khoản đăng nhập, đồng thời vẫn lưu trên trình duyệt của thiết bị đang dùng. Hãy bấm **⬇ Sao lưu** ở góc trên thường xuyên (file .json tải về máy) để có bản dự phòng — cần thì bấm **⬆ Khôi phục** và chọn file đó để lấy lại dữ liệu.

## Mã PIN bảo vệ (tuỳ chọn)
- Mở app đã có đăng nhập tài khoản bảo vệ. Có thể đặt thêm mã PIN: bấm **🔐 Mã PIN bảo vệ** → đặt mã PIN 6 chữ số.
- Mã PIN dùng để xác nhận khi **Xoá toàn bộ dữ liệu** và **Khôi phục dữ liệu** — tránh người khác táy máy xoá/ghi đè sổ sách.
- Đổi hoặc tắt PIN cũng ở mục đó (phải nhập PIN hiện tại trước).
- ⚠️ Quên PIN thì không xoá / khôi phục được dữ liệu. Hãy nhớ kỹ PIN và sao lưu dữ liệu thường xuyên.
