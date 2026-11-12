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
- **Sản phẩm**: bấm ＋ Thêm sản phẩm — form có sẵn mục "Lô nhập đầu tiên", điền luôn số lượng + giá nhập + hạn dùng là nhập lô luôn một lượt. Một sản phẩm nhập nhiều lần thì vào chi tiết sản phẩm → ＋ Nhập thêm lô (mỗi lô 1 hạn dùng + giá nhập riêng). **Sửa giá nhập**: mỗi lô có giá nhập riêng — trong form ✏️ Sửa sản phẩm có sẵn ô "Giá nhập — của lô gần nhất" để sửa nhanh; muốn sửa lô khác thì vào chi tiết sản phẩm, bấm **✏️ Sửa lô** ngay ở lô đó (sửa được ngày nhập, số lượng, giá nhập, hạn dùng). **Mã vạch**: mỗi loại sản phẩm có 1 mã vạch riêng — ở tab Sản phẩm bấm "Quét mã vạch" để tìm nhanh hàng đã có; khi thêm sản phẩm, cạnh ô Barcode có nút "Quét", quét là điền mã luôn (khỏi gõ 13 số). Nếu mã đó đã có trong kho, app báo ngay để mở sản phẩm cũ, không tạo trùng. Hàng mới quét xong app còn thử điền sẵn tên gợi ý (hàng nhập khẩu thường tra được; giá bán vẫn tự nhập).
- **Công nợ KH**: khách được xếp theo thôn (thôn thêm/sửa được ở nút 🏘 Quản lý thôn). Khi thêm khách mới, form có sẵn mục "Khoản nợ đầu tiên" để ghi luôn nếu khách mua nợ ngay; các khoản sau thì vào hồ sơ khách → ＋ Ghi khoản nợ mới. Khách trả tiền → bấm "Ghi trả nợ" ngay trong khoản nợ đó, tiền tự chạy sang mục Thu chi, không cần nhập lại. Trong hồ sơ mỗi khách có mục **🧾 Lịch sử đã trả**: gộp tất cả các lần khách đã trả (của mọi khoản nợ) — trả bao nhiêu, ngày nào, vào khoản nợ nào — khách hỏi là mở ra tra được ngay. Bấm **💰 Trả nợ** ở hồ sơ là trả cho tổng nợ: app tự chia vào các khoản nợ cũ nhất trước.
- **Nhà cung cấp**: vào hồ sơ → ＋ Thêm hoá đơn nhập (chụp ảnh hoá đơn). Trả tiền → bấm "Thanh toán" trong hoá đơn, tiền tự chạy sang mục Thu chi. Hoá đơn nào cũng có nút **✏️ Sửa hoá đơn** để sửa ngày, tổng tiền, ghi chú hoặc thêm ảnh — không phải xoá đi tạo lại; từng lần thanh toán cũng có nút **✏️ Sửa** riêng (sửa ngày / số tiền, mục Thu chi tự sửa theo).
- **Thu chi**: chỉ nhập tay các khoản khác (điện nước, vận chuyển, thu khác...). Khoản nào ghi "Tự động từ công nợ..." là app tự tạo, không sửa ở đây. Ngay dưới 3 ô tổng kết Thu/Chi/Lãi của kỳ có thêm 1 dòng tham khảo doanh thu + lãi bán hàng của cùng kỳ — dòng này chỉ để xem, KHÔNG cộng vào Tổng thu (tiền bán hàng xem chi tiết ở mục Sản phẩm) để tránh trùng với tiền khách trả nợ.
- **Ô nhập tiền** (giá bán, ghi nợ, trả nợ, hoá đơn...): gõ vài số đầu là app gợi ý sẵn các mức tiền ngay bên dưới, kiểu app ngân hàng — gõ "5" hiện 5.000 / 50.000 / 500.000 / 5.000.000, bấm vào mức đúng là điền xong, khỏi gõ nhiều số 0.

## Bán hàng & doanh thu (mới)
Vào chi tiết một sản phẩm → bấm **🛒 Bán hàng**: nhập số lượng + giá bán (app điền sẵn giá bán của sản phẩm, sửa được) — app **tự bốc hàng từ lô có hạn dùng gần nhất trước** (hết lô đó mới sang lô hạn xa hơn; trước khi lưu app cho xem trước sẽ trừ lô nào bao nhiêu) và ghi lại doanh thu + lãi. Ngay trong từng lô cũng có nút **Bán** riêng, dùng khi cần bán đúng lô đó (kiểm hàng thấy thùng nào hụt thì bấm bán ở lô đó). Ngay đầu tab Sản phẩm có khối **Doanh thu & lợi nhuận** — có bộ chọn xem theo **Ngày / Tháng / Quý / Năm / Tất cả**, hiển thị doanh thu + lãi của kỳ đang chọn và các lượt bán trong kỳ đó. Bấm nhầm thì bấm **Xoá** ở lượt bán đó — hàng tự cộng lại vào lô. Lưu ý: tiền bán hàng KHÔNG tự chạy sang mục Thu chi (sổ Thu chi giữ nguyên như cũ); doanh thu xem ở khối Doanh thu & lợi nhuận và trong file Excel (trang "Bán hàng"). Nút **− Bớt (huỷ / hao hụt)** vẫn dùng cho hàng hỏng, hết hạn, hao hụt — không tính là bán.

## Ảnh / video bằng chứng (mới)
Ở form ghi nợ, hoá đơn nhà cung cấp và thu chi: bấm **＋ Thêm ảnh / video** để chọn **nhiều tệp cùng lúc** (mỗi video tối đa **100MB**, ảnh app tự nén cho nhẹ). **Sản phẩm cũng chọn được nhiều ảnh** (nút **＋ Thêm ảnh**) — ảnh đầu tiên là ảnh đại diện, trong trang chi tiết sản phẩm có dải ảnh để bấm xem từng tấm. Khi bấm Lưu, app hiện **thanh tiến độ %** lúc tải; video lớn tải hơi lâu tuỳ mạng — đừng đóng app hay khoá màn hình trong lúc tải. Nếu một tệp lỗi, app vẫn lưu phần còn lại và báo rõ tên tệp chưa lên được để thêm lại sau. Tệp được tải lên kho lưu trữ riêng của cửa hàng nên xem lại được trên mọi máy đã đăng nhập; bấm vào hình thu nhỏ để xem lớn / xem video. Dung lượng kho hiện tại là 5GB — xem mức đã dùng trong **Tài khoản & đồng bộ** (trong đó có nút **🔍 Kiểm tra kho lưu trữ** để tự kiểm tra khi thấy tải tệp bất thường); khi gần đầy app sẽ báo ngay trong form để liên hệ nâng cấp.

## Tra cứu nhanh (mới)
- **Tìm bằng giọng nói**: cạnh các ô tìm kiếm (Sản phẩm / Công nợ KH / Nhà cung cấp) có nút 🎤 — bấm rồi đọc tên hàng / tên khách, app tự điền và tìm (trình duyệt Chrome trên Android hỗ trợ tốt nhất; iPhone có thể không có nút này).
- **Hỏi đáp nhanh**: bấm nút **💬** ở góc phải dưới → gõ câu hỏi như đang hỏi người: "khách Nguyễn Văn A còn nợ bao nhiêu", "bia hà nội còn bao nhiêu", "hôm nay bán được bao nhiêu", "tháng này lãi bao nhiêu", "ai đang nợ nhiều nhất", "hàng nào sắp hết hạn"… App trả lời ngay từ dữ liệu cửa hàng, không gửi dữ liệu đi đâu.

## Xuất báo cáo Excel
Bấm nút **Xuất báo cáo Excel** (ở menu trái trên máy tính, nút **Excel** trên điện thoại, hoặc ngay trên khối xanh ở trang Tổng quan) — app tải về 1 file .xlsx gồm 10 trang:
Tổng quan · Sản phẩm · Lô hàng · Công nợ khách hàng · Lịch sử trả nợ · Khách hàng · Hoá đơn NCC · Thanh toán NCC · Bán hàng · Thu chi.
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
